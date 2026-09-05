"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Game = {
  id: string;
  title: string;
  current_question: number;
  status:
    | "waiting"
    | "question"
    | "reveal"
    | "leaderboard"
    | "finished";
  question_started_at: string | null;
};

type Question = {
  id: string;
  question_number: number;
  image_url: string;
};

export default function PlayPage() {
  const [game, setGame] = useState<Game | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);

  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [joined, setJoined] = useState(false);

  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [seconds, setSeconds] = useState(30);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Daten für die Auflösung
  const [guessAnswer, setGuessAnswer] = useState<number | null>(null);
  const [guessPoints, setGuessPoints] = useState<number | null>(null);

  // Daten für die Rangliste
  const [totalPoints, setTotalPoints] = useState(0);
  const [rank, setRank] = useState<number | null>(null);

  /*
   * ---------------------------------------------------------
   * INITIALISIERUNG
   * ---------------------------------------------------------
   */

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    setLoading(true);
    setError("");

    // Aktuelles Spiel laden
    const { data: currentGame, error: gameError } = await supabase
      .from("games")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (gameError || !currentGame) {
      console.error(gameError);
      setError("Spiel konnte nicht geladen werden.");
      setLoading(false);
      return;
    }

    const loadedGame = currentGame as Game;

    setGame(loadedGame);

    // Gespeicherten Spieler aus localStorage laden
    const savedPlayerId = localStorage.getItem("quiz_player_id");
    const savedGameId = localStorage.getItem("quiz_game_id");

    // Noch kein gespeicherter Spieler
    if (!savedPlayerId || !savedGameId) {
      setLoading(false);
      return;
    }

    // Gespeicherter Spieler gehört zu einem alten Spiel
    if (savedGameId !== loadedGame.id) {
      localStorage.removeItem("quiz_player_id");
      localStorage.removeItem("quiz_player_name");
      localStorage.removeItem("quiz_game_id");

      setLoading(false);
      return;
    }

    // Prüfen, ob der Spieler noch existiert
    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("id, name, game_id")
      .eq("id", savedPlayerId)
      .eq("game_id", loadedGame.id)
      .maybeSingle();

    if (playerError || !player) {
      console.error(playerError);

      localStorage.removeItem("quiz_player_id");
      localStorage.removeItem("quiz_player_name");
      localStorage.removeItem("quiz_game_id");

      setLoading(false);
      return;
    }

    // Spieler wiederherstellen
    setPlayerId(player.id);
    setName(player.name);
    setJoined(true);

    setLoading(false);
  }

  /*
   * ---------------------------------------------------------
   * REALTIME GAME UPDATES
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!game) return;

    const channel = supabase
      .channel(`game-changes-${game.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          setGame(payload.new as Game);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [game?.id]);

  /*
   * ---------------------------------------------------------
   * FRAGE LADEN
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!game || !playerId || game.current_question === 0) {
      return;
    }

    loadQuestion(game.current_question);
  }, [game?.id, game?.current_question, playerId]);

  async function loadQuestion(questionNumber: number) {
    if (!game || !playerId) return;

    const { data, error } = await supabase
      .from("questions")
      .select("id, question_number, image_url")
      .eq("game_id", game.id)
      .eq("question_number", questionNumber)
      .single();

    if (error || !data) {
      console.error(error);
      return;
    }

    setQuestion(data);

    // Standardmäßig neue Frage
    setAnswer("");
    setSubmitted(false);

    // Alte Reveal-Daten zurücksetzen
    setGuessAnswer(null);
    setGuessPoints(null);

    // Prüfen, ob Spieler diese Frage bereits beantwortet hat
    const { data: existingAnswer, error: answerError } =
      await supabase
        .from("answers")
        .select("id, answer_year, points")
        .eq("player_id", playerId)
        .eq("question_id", data.id)
        .maybeSingle();

    if (answerError) {
      console.error(answerError);
      return;
    }

    // Bereits beantwortet
    if (existingAnswer) {
      setAnswer(String(existingAnswer.answer_year));
      setSubmitted(true);

      setGuessAnswer(existingAnswer.answer_year);
      setGuessPoints(existingAnswer.points);
    }
  }

  /*
   * ---------------------------------------------------------
   * TIMER
   * ---------------------------------------------------------
   */

	useEffect(() => {
	  if (
		game?.status !== "question" ||
		!game.question_started_at
	  ) {
		return;
	  }

	  const updateTimer = () => {
		const started = new Date(
		  game.question_started_at!
		).getTime();

		const elapsed = Math.floor(
		  (Date.now() - started) / 1000
		);

		setSeconds(Math.max(0, 30 - elapsed));
	  };

	  updateTimer();

	  const timer = setInterval(updateTimer, 250);

	  return () => clearInterval(timer);
	}, [game?.status, game?.question_started_at]);

  /*
   * ---------------------------------------------------------
   * SPIEL BEITRETEN
   * ---------------------------------------------------------
   */

  async function joinGame() {
    setError("");

    const cleanName = name.trim();

    if (!cleanName) {
      setError("Bitte gib deinen Namen ein.");
      return;
    }

    if (!game) {
      setError("Kein Spiel gefunden.");
      return;
    }

    const { data, error } = await supabase
      .from("players")
      .insert({
        game_id: game.id,
        name: cleanName,
      })
      .select()
      .single();

    if (error || !data) {
      console.error(error);
      setError("Beitritt zum Spiel fehlgeschlagen.");
      return;
    }

    // Spieler dauerhaft im Browser speichern
    localStorage.setItem("quiz_player_id", data.id);
    localStorage.setItem("quiz_player_name", cleanName);
    localStorage.setItem("quiz_game_id", game.id);

    setPlayerId(data.id);
    setName(cleanName);
    setJoined(true);
  }

  /*
   * ---------------------------------------------------------
   * ANTWORT ABSCHICKEN
   * ---------------------------------------------------------
   */

  async function submitAnswer() {
    if (!game || !question || !playerId) return;

    setError("");

    if (seconds <= 0) {
      setError("Die Zeit ist abgelaufen.");
      return;
    }

    const year = Number(answer);

    if (
      !Number.isInteger(year) ||
      year < 1800 ||
      year > 2100
    ) {
      setError("Bitte gib ein gültiges Jahr ein.");
      return;
    }

    try {
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerId,
          questionId: question.id,
          answerYear: year,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        setError(
          responseData.error ||
            "Antwort konnte nicht gespeichert werden."
        );
        return;
      }

      setSubmitted(true);
      setGuessAnswer(year);

      // Falls die API Punkte zurückgibt
      if (typeof responseData.points === "number") {
        setGuessPoints(responseData.points);
      }

      setError("");
    } catch (error) {
      console.error(error);

      setError(
        "Antwort konnte nicht gespeichert werden."
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * REVEAL DATEN LADEN
   * ---------------------------------------------------------
   */

  async function loadRevealData() {
    if (!playerId || !question) return;

    const { data, error } = await supabase
      .from("answers")
      .select("answer_year, points")
      .eq("player_id", playerId)
      .eq("question_id", question.id)
      .maybeSingle();

    if (error) {
      console.error("Reveal-Daten Fehler:", error);
      return;
    }

    if (data) {
      setGuessAnswer(data.answer_year);
      setGuessPoints(data.points);
    } else {
      setGuessAnswer(null);
      setGuessPoints(null);
    }
  }

  /*
   * ---------------------------------------------------------
   * LEADERBOARD DATEN LADEN
   * ---------------------------------------------------------
   */

  async function loadLeaderboardData() {
    if (!game || !playerId) return;

    // Alle Spieler des Spiels laden
    const { data: players, error: playersError } =
      await supabase
        .from("players")
        .select("id")
        .eq("game_id", game.id);

    if (playersError || !players) {
      console.error(playersError);
      return;
    }

    // Alle Fragen des Spiels laden
    const { data: gameQuestions, error: questionsError } =
      await supabase
        .from("questions")
        .select("id")
        .eq("game_id", game.id);

    if (questionsError || !gameQuestions) {
      console.error(questionsError);
      return;
    }

    const questionIds = gameQuestions.map(
      (question) => question.id
    );

    // Falls es noch keine Fragen gibt
    if (questionIds.length === 0) {
      setTotalPoints(0);
      setRank(1);
      return;
    }

    // Alle Antworten des Spiels laden
    const { data: answers, error: answersError } =
      await supabase
        .from("answers")
        .select("player_id, points")
        .in("question_id", questionIds);

    if (answersError || !answers) {
      console.error(answersError);
      return;
    }

    /*
     * Für jeden Spieler einen Startwert von 0 erstellen.
     * Dadurch erscheinen auch Spieler ohne Punkte
     * in der Rangliste.
     */
    const scores: Record<string, number> = {};

    players.forEach((player) => {
      scores[player.id] = 0;
    });

    // Punkte zusammenrechnen
    answers.forEach((answer) => {
      if (!scores[answer.player_id]) {
        scores[answer.player_id] = 0;
      }

      scores[answer.player_id] += answer.points || 0;
    });

    // Nach Punkten sortieren
    const leaderboard = Object.entries(scores)
      .map(([id, points]) => ({
        playerId: id,
        points,
      }))
      .sort((a, b) => b.points - a.points);

    // Eigenen Spieler suchen
    const playerIndex = leaderboard.findIndex(
      (player) => player.playerId === playerId
    );

    if (playerIndex === -1) {
      setRank(null);
      setTotalPoints(0);
      return;
    }

    const currentPlayer = leaderboard[playerIndex];

    setTotalPoints(currentPlayer.points);

    /*
     * Rang berechnen.
     *
     * Bei Gleichstand bekommen Spieler den gleichen Rang:
     *
     * 100 Punkte → #1
     * 80 Punkte  → #2
     * 80 Punkte  → #2
     * 50 Punkte  → #4
     */
    let calculatedRank = 1;

    for (let i = 0; i < playerIndex; i++) {
      if (
        leaderboard[i].points >
        currentPlayer.points
      ) {
        calculatedRank++;
      }
    }

    setRank(calculatedRank);
  }

  /*
   * ---------------------------------------------------------
   * STATUSWECHSEL: REVEAL / LEADERBOARD
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!game || !playerId) return;

    if (
      game.status === "reveal" &&
      question
    ) {
      loadRevealData();
    }

    if (game.status === "leaderboard") {
      loadLeaderboardData();
    }
  }, [
    game?.status,
    playerId,
    question?.id,
  ]);

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-gray-900 p-6">
        <div className="text-center">
          <div className="text-6xl mb-6">📸</div>

          <h1 className="text-4xl font-black text-red-600 mb-4">
            JTRI Jubiläums-Quiz
          </h1>

          <p className="text-gray-600">
            Lade Quiz...
          </p>
        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * KEIN SPIEL
   * ---------------------------------------------------------
   */

  if (!game) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-red-700 p-6">
        <div className="text-center">
          <div className="text-6xl mb-6">📸</div>

          <h1 className="text-4xl font-black mb-4">
            JTRI Jubiläums-Quiz
          </h1>

          <p className="text-gray-600">
            Kein Spiel gefunden.
          </p>

          {error && (
            <p className="text-red-600 mt-4">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * REGISTRIERUNG
   * ---------------------------------------------------------
   */

  if (!joined) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-gray-900 p-6">
        <div className="w-full max-w-md text-center">
          <div className="text-7xl mb-6">📸</div>

          <h1 className="text-5xl font-black text-red-600 mb-3">
            JTRI Jubiläums-Quiz
          </h1>

          <p className="text-gray-600 text-lg mb-8">
            Gib deinen Namen ein und spiel mit!
          </p>

          <input
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                joinGame();
              }
            }}
            placeholder="Dein Name"
            className="w-full rounded-2xl p-4 text-xl text-black bg-white mb-4 border-2 border-gray-200 focus:border-red-600 focus:outline-none"
          />

          <button
            onClick={joinGame}
            className="w-full rounded-2xl bg-red-600 text-white font-bold text-xl p-4 shadow-lg active:scale-95 transition"
          >
            Mitspielen
          </button>

          {error && (
            <p className="text-red-600 font-semibold mt-4">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * WARTEN
   * ---------------------------------------------------------
   */

  if (game.status === "waiting") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-gray-900 p-6 text-center">
        <div>
          <div className="text-7xl mb-6">⏳</div>

          <h1 className="text-4xl font-black text-red-600 mb-4">
            Hallo {name}!
          </h1>

          <p className="text-2xl text-gray-600">
            Warte auf den Start...
          </p>
        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * QUIZ BEENDET
   * ---------------------------------------------------------
   */

  if (game.status === "finished") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-red-600 text-white p-6 text-center">
        <div>
          <div className="text-7xl mb-6">🏆</div>

          <h1 className="text-4xl font-black mb-4">
            Quiz beendet!
          </h1>

          <p className="text-xl">
            Danke fürs Mitspielen, {name}!
          </p>

          <div className="mt-8 bg-white/10 rounded-2xl p-6">
            <p className="text-lg opacity-80">
              Deine Gesamtpunktzahl
            </p>

            <p className="text-5xl font-black mt-2">
              {totalPoints}
            </p>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * AUFLÖSUNG
   * ---------------------------------------------------------
   */

  if (game.status === "reveal") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-gray-900 p-6 text-center">
        <div className="w-full max-w-md">

          <div className="text-6xl mb-6">
            📸
          </div>

          <h1 className="text-4xl font-black text-red-600 mb-8">
            Auflösung
          </h1>

          {guessAnswer !== null ? (
            <div className="space-y-5">

              <div className="bg-gray-50 rounded-3xl p-7 border border-gray-200">
                <p className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-3">
                  Dein Tipp
                </p>

                <p className="text-6xl font-black text-gray-900">
                  {guessAnswer}
                </p>
              </div>

              <div className="bg-red-50 rounded-3xl p-7 border-2 border-red-100">
                <p className="text-red-600 text-sm font-bold uppercase tracking-wider mb-3">
                  Deine Punkte
                </p>

                <p className="text-7xl font-black text-red-600">
                  {guessPoints ?? 0}
                </p>

                <p className="text-gray-500 mt-3">
                  Punkte für diese Frage
                </p>
              </div>

            </div>
          ) : (
            <div className="bg-gray-50 rounded-3xl p-8 border border-gray-200">
              <div className="text-5xl mb-4">
                ⏱️
              </div>

              <p className="text-xl font-bold text-gray-700">
                Du hast keine Antwort abgegeben.
              </p>
            </div>
          )}

          <p className="text-gray-500 mt-10">
            Warte auf die nächste Frage.
          </p>

        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * LEADERBOARD
   * ---------------------------------------------------------
   */

  if (game.status === "leaderboard") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-gray-900 p-6 text-center">
        <div className="w-full max-w-md">

          <div className="text-7xl mb-6">
            🏆
          </div>

          <h1 className="text-4xl font-black text-red-600 mb-8">
            Dein Zwischenstand
          </h1>

          <div className="space-y-5">

            <div className="bg-red-600 text-white rounded-3xl p-8 shadow-lg">
              <p className="text-sm font-bold uppercase tracking-wider opacity-80 mb-3">
                Dein Rang
              </p>

              <p className="text-7xl font-black">
                {rank !== null
                  ? `#${rank}`
                  : "..."}
              </p>
            </div>

            <div className="bg-gray-50 rounded-3xl p-8 border-2 border-gray-100">
              <p className="text-gray-500 text-sm font-bold uppercase tracking-wider mb-3">
                Gesamtpunkte
              </p>

              <p className="text-7xl font-black text-gray-900">
                {totalPoints}
              </p>

              <p className="text-gray-500 mt-3">
                Punkte
              </p>
            </div>

          </div>

          <p className="text-gray-500 mt-10">
            Die nächste Runde startet gleich.
          </p>

        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * FRAGE
   * ---------------------------------------------------------
   */

  return (
    <main className="min-h-screen bg-white text-gray-900 p-6">
      <div className="max-w-xl mx-auto">

        <div className="h-2 bg-red-600 rounded-full mb-6" />

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-black text-red-600">
            Frage {game.current_question}
          </h1>

          <div
            className={`text-3xl font-black ${
              seconds <= 5
                ? "text-red-600"
                : "text-gray-900"
            }`}
          >
            {seconds}s
          </div>
        </div>

        {question && (
          <>
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6">
              <img
                src={question.image_url}
                alt="Quizfoto"
                className="w-full"
              />
            </div>

            {!submitted ? (
              <>
                <p className="text-xl font-bold mb-3">
                  Aus welchem Jahr stammt das Foto?
                </p>

                <input
                  type="number"
                  value={answer}
                  onChange={(e) =>
                    setAnswer(e.target.value)
                  }
                  placeholder="Jahr"
                  className="w-full rounded-2xl p-5 text-2xl text-black bg-white mb-4 text-center border-2 border-gray-200 focus:border-red-600 focus:outline-none appearance-none [appearance:textfield]"
                  disabled={seconds <= 0}
                />

                <button
                  onClick={submitAnswer}
                  disabled={seconds <= 0}
                  className="w-full rounded-2xl bg-red-600 text-white font-black text-xl p-5 shadow-lg disabled:opacity-40 active:scale-95 transition"
                >
                  ANTWORT ABSCHICKEN
                </button>
              </>
            ) : (
              <div className="text-center bg-red-50 rounded-2xl p-8 border-2 border-red-100">
                <div className="text-6xl mb-4">
                  ✅
                </div>

                <h2 className="text-3xl font-black text-red-600 mb-2">
                  Antwort gespeichert!
                </h2>

                <p className="text-gray-700">
                  Deine Antwort:{" "}
                  <strong>{answer}</strong>
                </p>

                <p className="text-gray-500 mt-4">
                  Warte auf die Auflösung.
                </p>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="text-red-600 font-semibold text-center mt-4">
            {error}
          </p>
        )}

      </div>
    </main>
  );
}
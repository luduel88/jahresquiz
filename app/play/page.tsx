"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Game = {
  id: string;
  title: string;
  current_question: number;
  status: "waiting" | "question" | "reveal" | "leaderboard" | "finished";
  question_started_at: string | null;
};

type Question = {
  id: string;
  question_number: number;
  image_url: string;
  correct_year: number;
};

export default function PlayPage() {
  const [game, setGame] = useState<Game | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [joined, setJoined] = useState(false);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [seconds, setSeconds] = useState(20);
  const [error, setError] = useState("");

  useEffect(() => {
    loadGame();
  }, []);

  async function loadGame() {
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      setError("Spiel konnte nicht geladen werden.");
      console.error(error);
      return;
    }

    setGame(data);
  }

  useEffect(() => {
    if (!game) return;

    const channel = supabase
      .channel("game-changes")
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

  useEffect(() => {
    if (!game || game.current_question === 0) {
      setQuestion(null);
      return;
    }

    loadQuestion(game.current_question);
  }, [game?.current_question]);

  async function loadQuestion(questionNumber: number) {
    if (!game) return;

    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("game_id", game.id)
      .eq("question_number", questionNumber)
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setQuestion(data);
    setAnswer("");
    setSubmitted(false);
  }

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

      setSeconds(Math.max(0, 20 - elapsed));
    };

    updateTimer();

    const timer = setInterval(updateTimer, 250);

    return () => clearInterval(timer);
  }, [game?.status, game?.question_started_at]);

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

    if (error) {
      console.error(error);
      setError("Beitritt zum Spiel fehlgeschlagen.");
      return;
    }

    setPlayerId(data.id);
    setJoined(true);
  }

  async function submitAnswer() {
    if (!game || !question || !playerId) return;

    if (seconds <= 0) {
      setError("Die Zeit ist abgelaufen.");
      return;
    }

    const year = Number(answer);

    if (!Number.isInteger(year) || year < 1800 || year > 2100) {
      setError("Bitte gib ein gültiges Jahr ein.");
      return;
    }

    const points = Math.abs(year - question.correct_year);

    const { error } = await supabase
      .from("answers")
      .insert({
        player_id: playerId,
        question_id: question.id,
        answer_year: year,
        points,
      });

    if (error) {
      console.error(error);
      setError("Antwort konnte nicht gespeichert werden.");
      return;
    }

    setSubmitted(true);
    setError("");
  }

  if (!game) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white p-6">
        <div className="text-center">
          <h1 className="text-4xl font-black mb-4">
            📸 JAHRES-QUIZ
          </h1>
          <p>Lade Quiz...</p>
        </div>
      </main>
    );
  }

  if (!joined) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-indigo-950 text-white p-6">
        <div className="w-full max-w-md text-center">
          <div className="text-6xl mb-6">📸</div>

          <h1 className="text-4xl font-black mb-3">
            JAHRES-QUIZ
          </h1>

          <p className="text-gray-300 mb-8">
            Gib deinen Namen ein und spiel mit!
          </p>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") joinGame();
            }}
            placeholder="Dein Name"
            className="w-full rounded-2xl p-4 text-xl text-black bg-white mb-4"
          />

          <button
            onClick={joinGame}
            className="w-full rounded-2xl bg-white text-black font-bold text-xl p-4"
          >
            Mitspielen
          </button>

          {error && (
            <p className="text-red-400 mt-4">{error}</p>
          )}
        </div>
      </main>
    );
  }

  if (game.status === "waiting") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-indigo-950 text-white p-6 text-center">
        <div>
          <div className="text-7xl mb-6">⏳</div>

          <h1 className="text-4xl font-black mb-4">
            Hallo {name}!
          </h1>

          <p className="text-2xl text-gray-300">
            Warte auf den Start...
          </p>
        </div>
      </main>
    );
  }

  if (game.status === "finished") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white p-6 text-center">
        <div>
          <div className="text-7xl mb-6">🏆</div>

          <h1 className="text-4xl font-black mb-4">
            Quiz beendet!
          </h1>

          <p className="text-xl text-gray-300">
            Danke fürs Mitspielen, {name}!
          </p>
        </div>
      </main>
    );
  }

  if (game.status === "reveal") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white p-6 text-center">
        <div>
          <div className="text-6xl mb-6">✅</div>

          <h1 className="text-3xl font-black mb-4">
            Antwort gespeichert
          </h1>

          <p className="text-xl text-gray-300">
            Warte auf die nächste Frage.
          </p>
        </div>
      </main>
    );
  }

  if (game.status === "leaderboard") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white p-6 text-center">
        <div>
          <div className="text-6xl mb-6">🏆</div>

          <h1 className="text-3xl font-black mb-4">
            Zwischenstand
          </h1>

          <p className="text-xl text-gray-300">
            Die Rangliste siehst du auf dem Bildschirm.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-black">
            Frage {game.current_question}
          </h1>

          <div className="text-3xl font-black">
            {seconds}s
          </div>
        </div>

        {question && (
          <>
            <img
              src={question.image_url}
              alt="Quizfoto"
              className="w-full rounded-2xl mb-6"
            />

            {!submitted ? (
              <>
                <p className="text-xl mb-3">
                  Aus welchem Jahr stammt das Foto?
                </p>

                <input
                  type="number"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Jahr"
                  className="w-full rounded-2xl p-5 text-2xl text-black bg-white mb-4 text-center"
                  disabled={seconds <= 0}
                />

                <button
                  onClick={submitAnswer}
                  disabled={seconds <= 0}
                  className="w-full rounded-2xl bg-white text-black font-black text-xl p-5 disabled:opacity-40"
                >
                  Antwort abschicken
                </button>
              </>
            ) : (
              <div className="text-center">
                <div className="text-6xl mb-4">✅</div>

                <h2 className="text-3xl font-black mb-2">
                  Antwort gespeichert!
                </h2>

                <p className="text-gray-300">
                  Deine Antwort: {answer}
                </p>

                <p className="text-gray-400 mt-4">
                  Warte auf die Auflösung.
                </p>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="text-red-400 text-center mt-4">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
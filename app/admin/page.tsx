"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminPage() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [game, setGame] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [answerCount, setAnswerCount] = useState(0);

  // --------------------------------
  // LOGIN PRÜFEN
  // --------------------------------

  useEffect(() => {
    async function checkLogin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);
      setSessionChecked(true);
    }

    checkLogin();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // --------------------------------
  // EINLOGGEN
  // --------------------------------

  async function login() {
    setLoginError("");

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      console.error(error);
      setLoginError(
        "E-Mail oder Passwort ist falsch."
      );
      return;
    }

    setUser(data.user);
    setPassword("");
  }

  // --------------------------------
  // AUSLOGGEN
  // --------------------------------

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  // --------------------------------
  // DATEN LADEN
  // --------------------------------

  async function loadData() {
    const { data: gameData, error: gameError } =
      await supabase
        .from("games")
        .select("*")
        .limit(1)
        .single();

    if (gameError) {
      console.error("Game error:", gameError);
      return;
    }

    if (!gameData) return;

    setGame(gameData);

    // Teilnehmer laden
    const { data: playersData, error: playersError } =
      await supabase
        .from("players")
        .select("*")
        .eq("game_id", gameData.id);

    if (playersError) {
      console.error("Players error:", playersError);
      return;
    }

    setPlayers(playersData || []);

    // Antworten der aktuellen Frage zählen
    if (gameData.current_question > 0) {
      const { data: questionData } =
        await supabase
          .from("questions")
          .select("id")
          .eq("game_id", gameData.id)
          .eq(
            "question_number",
            gameData.current_question
          )
          .single();

      if (questionData) {
        const { count } = await supabase
          .from("answers")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq(
            "question_id",
            questionData.id
          );

        setAnswerCount(count || 0);
      }
    } else {
      setAnswerCount(0);
    }
  }

  // --------------------------------
  // LIVE AKTUALISIERUNG
  // --------------------------------

  useEffect(() => {
    if (!user) return;

    loadData();

    const channel = supabase
      .channel("admin-live")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
        },
        () => {
          loadData();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
        },
        () => {
          loadData();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "answers",
        },
        () => {
          loadData();
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // --------------------------------
  // NÄCHSTE FRAGE
  // --------------------------------

  async function startNextQuestion() {
    if (!game) return;

    const nextQuestion =
      game.current_question + 1;

    if (nextQuestion > 20) {
      alert("Alle 20 Fragen sind gespielt.");
      return;
    }

    const { error } = await supabase
      .from("games")
      .update({
        current_question: nextQuestion,
        status: "question",
        question_started_at:
          new Date().toISOString(),
      })
      .eq("id", game.id);

    if (error) {
      console.error(error);
      alert("Fehler beim Starten der Frage.");
      return;
    }

    await loadData();
  }

  // --------------------------------
  // ANTWORT AUFLÖSEN
  // --------------------------------

  async function revealAnswer() {
    if (!game) return;

    const { error } = await supabase
      .from("games")
      .update({
        status: "reveal",
      })
      .eq("id", game.id);

    if (error) {
      console.error(error);
      alert("Fehler.");
      return;
    }

    await loadData();
  }

  // --------------------------------
  // RANGLISTE
  // --------------------------------

  async function showLeaderboard() {
    if (!game) return;

    const { error } = await supabase
      .from("games")
      .update({
        status: "leaderboard",
      })
      .eq("id", game.id);

    if (error) {
      console.error(error);
      alert("Fehler.");
      return;
    }

    await loadData();
  }

  // --------------------------------
  // QUIZ BEENDEN
  // --------------------------------

  async function finishGame() {
    if (!game) return;

    const { error } = await supabase
      .from("games")
      .update({
        status: "finished",
      })
      .eq("id", game.id);

    if (error) {
      console.error(error);
      alert("Fehler beim Beenden.");
      return;
    }

    await loadData();
  }

  // --------------------------------
  // QUIZ ZURÜCKSETZEN
  // --------------------------------

  async function resetQuiz() {
    if (!game) return;

    const confirmed = window.confirm(
      "QUIZ ZURÜCKSETZEN?\n\n" +
        "Teilnehmer und Antworten werden gelöscht.\n\n" +
        "Die 20 Fragen und Bilder bleiben erhalten."
    );

    if (!confirmed) {
      return;
    }

    try {
      const { error: answersError } =
        await supabase
          .from("answers")
          .delete()
          .neq(
            "id",
            "00000000-0000-0000-0000-000000000000"
          );

      if (answersError) {
        console.error(
          "Antworten konnten nicht gelöscht werden:",
          answersError
        );

        alert(
          "Fehler beim Löschen der Antworten.\n\n" +
            answersError.message
        );

        return;
      }

      const { error: playersError } =
        await supabase
          .from("players")
          .delete()
          .eq("game_id", game.id);

      if (playersError) {
        console.error(
          "Teilnehmer konnten nicht gelöscht werden:",
          playersError
        );

        alert(
          "Fehler beim Löschen der Teilnehmer.\n\n" +
            playersError.message
        );

        return;
      }

      const { error: gameError } =
        await supabase
          .from("games")
          .update({
            current_question: 0,
            status: "waiting",
            question_started_at: null,
          })
          .eq("id", game.id);

      if (gameError) {
        console.error(
          "Spiel konnte nicht zurückgesetzt werden:",
          gameError
        );

        alert(
          "Fehler beim Zurücksetzen des Spiels.\n\n" +
            gameError.message
        );

        return;
      }

      setPlayers([]);
      setAnswerCount(0);

      await loadData();

      alert(
        "✅ Quiz wurde erfolgreich zurückgesetzt!\n\n" +
          "Der QR-Code kann jetzt wieder verwendet werden."
      );
    } catch (error) {
      console.error(error);

      alert(
        "Ein unerwarteter Fehler ist aufgetreten."
      );
    }
  }

  // --------------------------------
  // NOCH LOGIN PRÜFEN
  // --------------------------------

  if (!sessionChecked) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-2xl">
          Prüfe Anmeldung...
        </div>
      </main>
    );
  }

  // --------------------------------
  // LOGIN-SEITE
  // --------------------------------

  if (!user) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-indigo-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-gray-900 rounded-3xl p-8 shadow-2xl">

          <div className="text-center mb-8">
            <div className="text-6xl mb-4">
              🔐
            </div>

            <h1 className="text-4xl font-black">
              Moderator
            </h1>

            <p className="text-gray-400 mt-3">
              Bitte anmelden
            </p>
          </div>

          <input
            type="email"
            placeholder="E-Mail"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            className="w-full rounded-2xl p-4 text-xl text-black bg-white mb-4"
          />

          <input
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                login();
              }
            }}
            className="w-full rounded-2xl p-4 text-xl text-black bg-white mb-4"
          />

          {loginError && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 rounded-xl p-4 mb-4 text-center">
              {loginError}
            </div>
          )}

          <button
            onClick={login}
            className="w-full bg-purple-600 hover:bg-purple-700 p-5 rounded-2xl text-xl font-bold"
          >
            🔓 Einloggen
          </button>

        </div>
      </main>
    );
  }

  // --------------------------------
  // ADMIN-ANSICHT
  // --------------------------------

  return (
    <main
      className="
        min-h-screen
        bg-gray-950
        text-white
        p-6
        md:p-10
      "
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">

        <h1
          className="
            text-4xl
            md:text-6xl
            font-black
          "
        >
          🎛 Moderator
        </h1>

        <button
          onClick={logout}
          className="
            bg-gray-800
            hover:bg-gray-700
            border
            border-gray-600
            px-6
            py-3
            rounded-xl
            font-bold
          "
        >
          🔒 Abmelden
        </button>

      </div>

      {game && (
        <div
          className="
            grid
            grid-cols-1
            lg:grid-cols-2
            gap-8
          "
        >

          {/* LINKER BEREICH */}

          <div
            className="
              bg-gray-900
              rounded-3xl
              p-8
            "
          >
            <h2
              className="
                text-2xl
                font-bold
                mb-6
              "
            >
              Spielstatus
            </h2>

            <div className="space-y-3 mb-10">

              <div>
                Teilnehmer:{" "}
                <strong>
                  {players.length}
                </strong>
              </div>

              <div>
                Frage:{" "}
                <strong>
                  {game.current_question} / 20
                </strong>
              </div>

              <div>
                Antworten:{" "}
                <strong>
                  {answerCount} / {players.length}
                </strong>
              </div>

              <div>
                Status:{" "}
                <strong>
                  {game.status}
                </strong>
              </div>

            </div>

            <div className="space-y-4">

              <button
                onClick={startNextQuestion}
                className="
                  w-full
                  bg-green-600
                  hover:bg-green-700
                  p-6
                  rounded-2xl
                  text-xl
                  font-bold
                "
              >
                ▶ Nächste Frage starten
              </button>

              <button
                onClick={revealAnswer}
                className="
                  w-full
                  bg-blue-600
                  hover:bg-blue-700
                  p-6
                  rounded-2xl
                  text-xl
                  font-bold
                "
              >
                👁 Richtige Antwort zeigen
              </button>

              <button
                onClick={showLeaderboard}
                className="
                  w-full
                  bg-purple-600
                  hover:bg-purple-700
                  p-6
                  rounded-2xl
                  text-xl
                  font-bold
                "
              >
                🏆 Rangliste anzeigen
              </button>

              <button
                onClick={finishGame}
                className="
                  w-full
                  bg-red-600
                  hover:bg-red-700
                  p-4
                  rounded-2xl
                  font-bold
                "
              >
                🛑 Quiz beenden
              </button>

              <div className="border-t border-gray-700 my-6" />

              <button
                onClick={resetQuiz}
                className="
                  w-full
                  bg-gray-800
                  hover:bg-gray-700
                  border-2
                  border-orange-500
                  text-orange-400
                  p-5
                  rounded-2xl
                  text-xl
                  font-bold
                "
              >
                🔄 Quiz zurücksetzen
              </button>

              <p className="text-sm text-gray-500 text-center">
                Teilnehmer und Antworten werden gelöscht.
                <br />
                Fragen und Bilder bleiben erhalten.
              </p>

            </div>
          </div>

          {/* RECHTER BEREICH */}

          <div
            className="
              bg-gray-900
              rounded-3xl
              p-8
            "
          >
            <h2
              className="
                text-2xl
                font-bold
                mb-6
              "
            >
              Teilnehmer ({players.length})
            </h2>

            <div
              className="
                space-y-2
                max-h-[600px]
                overflow-y-auto
              "
            >

              {players.map((player) => (
                <div
                  key={player.id}
                  className="
                    bg-gray-800
                    p-4
                    rounded-xl
                  "
                >
                  {player.name}
                </div>
              ))}

              {players.length === 0 && (
                <p className="text-gray-500">
                  Noch keine Teilnehmer.
                </p>
              )}

            </div>
          </div>

        </div>
      )}
    </main>
  );
}
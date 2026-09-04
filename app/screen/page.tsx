"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { supabase } from "@/lib/supabase";
import Countdown from "@/components/Countdown";
import Leaderboard from "@/components/Leaderboard";

export default function ScreenPage() {
  const [game, setGame] = useState<any>(null);
  const [question, setQuestion] = useState<any>(null);
  const [playUrl, setPlayUrl] = useState("");

  async function loadGame() {
    const { data: gameData } = await supabase
      .from("games")
      .select("*")
      .limit(1)
      .single();

    if (!gameData) return;

    setGame(gameData);

    if (gameData.current_question > 0) {
      const { data: questionData } = await supabase
        .from("questions")
        .select("*")
        .eq("game_id", gameData.id)
        .eq(
          "question_number",
          gameData.current_question
        )
        .single();

      setQuestion(questionData);
    } else {
      setQuestion(null);
    }
  }

  useEffect(() => {
    setPlayUrl(`${window.location.origin}/play`);

    loadGame();

    const channel = supabase
      .channel("screen-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
        },
        loadGame
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!game) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center text-white text-3xl">
        Lädt...
      </main>
    );
  }

  // WAITING
  if (game.status === "waiting") {
    return (
      <main
        className="
          min-h-screen
          bg-gradient-to-br
          from-purple-900
          via-black
          to-indigo-950
          flex
          flex-col
          justify-center
          items-center
          text-center
          p-10
          text-white
        "
      >
        <h1 className="text-7xl md:text-8xl font-black mb-6">
          📸 JAHRES-QUIZ
        </h1>

        <p className="text-3xl md:text-4xl text-gray-300 mb-10">
          Scanne den QR-Code und spiel mit!
        </p>

        {playUrl && (
          <div className="bg-white p-8 rounded-3xl shadow-2xl">
            <QRCodeSVG
              value={playUrl}
              size={400}
              level="H"
            />
          </div>
        )}

        <p className="text-2xl text-gray-300 mt-8">
          {playUrl}
        </p>

        <p className="text-2xl text-gray-400 mt-6">
          Macht euch bereit! 🚀
        </p>
      </main>
    );
  }

  // QUESTION
  if (game.status === "question" && question) {
    return (
      <main
        className="
          min-h-screen
          bg-black
          relative
          flex
          items-center
          justify-center
          p-12
          text-white
        "
      >
        <div
          className="
            absolute
            top-10
            left-10
            text-4xl
            font-bold
          "
        >
          Frage {question.question_number} / 20
        </div>

        {game.question_started_at && (
          <div
            className="
              absolute
              top-6
              right-10
            "
          >
            <Countdown
              startedAt={game.question_started_at}
              duration={20}
            />
          </div>
        )}

        <img
          src={question.image_url}
          alt="Quiz"
          className="
            max-h-[82vh]
            max-w-[90vw]
            object-contain
            rounded-3xl
          "
        />
      </main>
    );
  }

  // REVEAL
  if (game.status === "reveal" && question) {
    return (
      <main
        className="
          min-h-screen
          bg-gradient-to-br
          from-purple-900
          to-black
          flex
          flex-col
          justify-center
          items-center
          text-center
          p-10
          text-white
        "
      >
        <img
          src={question.image_url}
          alt="Quiz"
          className="
            max-h-[45vh]
            rounded-3xl
            mb-10
          "
        />

        <p
          className="
            text-4xl
            text-gray-300
            mb-4
          "
        >
          Das richtige Jahr war:
        </p>

        <h1
          className="
            text-[14rem]
            font-black
            leading-none
          "
        >
          {question.correct_year}
        </h1>
      </main>
    );
  }

  // LEADERBOARD
  if (game.status === "leaderboard") {
    return (
      <main
        className="
          min-h-screen
          bg-gradient-to-br
          from-purple-900
          via-black
          to-indigo-950
          p-12
          text-white
        "
      >
        <Leaderboard
          gameId={game.id}
          limit={10}
        />
      </main>
    );
  }

  // FINISHED
  if (game.status === "finished") {
    return (
      <main
        className="
          min-h-screen
          bg-gradient-to-br
          from-yellow-500
          via-purple-700
          to-black
          flex
          items-center
          justify-center
          text-center
          text-white
        "
      >
        <div>
          <div className="text-9xl mb-10">
            🏆
          </div>

          <h1
            className="
              text-8xl
              font-black
            "
          >
            DAS QUIZ IST BEENDET!
          </h1>
        </div>
      </main>
    );
  }

  return null;
}
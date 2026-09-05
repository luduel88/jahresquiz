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
        .select(
          "id, game_id, question_number, image_url, correct_year"
        )
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
      <main className="min-h-screen bg-white flex items-center justify-center text-red-700 text-3xl">
        Lädt...
      </main>
    );
  }

  // WAITING
  if (game.status === "waiting") {
    return (
      <main className="min-h-screen bg-white flex flex-col justify-center items-center text-center p-10 text-red-700">
        <div className="absolute top-0 left-0 right-0 h-4 bg-red-600" />

        <h1 className="text-7xl md:text-8xl font-black mb-6">
          📸 JTRI Jubiläums-Quiz
        </h1>

        <p className="text-3xl md:text-4xl text-gray-700 mb-10">
          Scanne den QR-Code und spiel mit!
        </p>

        {playUrl && (
          <div className="bg-white p-8 rounded-3xl shadow-2xl border-8 border-red-600">
            <QRCodeSVG
              value={playUrl}
              size={400}
              level="H"
            />
          </div>
        )}

        <p className="text-2xl text-gray-600 mt-8">
          {playUrl}
        </p>

        <p className="text-2xl text-red-600 font-bold mt-6">
          Macht euch bereit! 🚀
        </p>
      </main>
    );
  }

  // QUESTION
  if (game.status === "question" && question) {
    return (
      <main className="min-h-screen bg-white relative flex items-center justify-center p-12 text-gray-900">
        <div className="absolute top-0 left-0 right-0 h-4 bg-red-600" />

        <div className="absolute top-10 left-10 text-4xl font-black text-red-700">
          Frage {question.question_number} / 45
        </div>

        {game.question_started_at && (
          <div className="absolute top-6 right-10 bg-red-600 text-white px-8 py-4 rounded-2xl shadow-lg">
            <Countdown
              startedAt={game.question_started_at}
              duration={30}
            />
          </div>
        )}

        <div className="bg-white p-5 rounded-3xl shadow-2xl border-4 border-red-100">
          <img
            src={question.image_url}
            alt="Quiz"
            className="max-h-[78vh] max-w-[88vw] object-contain rounded-2xl"
          />
        </div>
      </main>
    );
  }

  // REVEAL
  if (game.status === "reveal" && question) {
    return (
      <main className="min-h-screen bg-white flex flex-col justify-center items-center text-center p-10 text-gray-900">
        <div className="absolute top-0 left-0 right-0 h-4 bg-red-600" />

        <img
          src={question.image_url}
          alt="Quiz"
          className="max-h-[40vh] rounded-3xl mb-8 shadow-xl border-4 border-red-100"
        />

        <p className="text-4xl text-gray-600 mb-4">
          Das richtige Jahr war:
        </p>

        <h1 className="text-[14rem] font-black leading-none text-red-600">
          {question.correct_year}
        </h1>
      </main>
    );
  }

  // LEADERBOARD
  if (game.status === "leaderboard") {
    return (
      <main className="min-h-screen bg-white p-12 text-gray-900">
        <div className="absolute top-0 left-0 right-0 h-4 bg-red-600" />

        <div className="max-w-6xl mx-auto pt-8">

          <div className="bg-white rounded-3xl shadow-2xl border-4 border-red-100 p-8">
            <Leaderboard
              gameId={game.id}
              limit={10}
            />
          </div>
        </div>
      </main>
    );
  }

  // FINISHED
  if (game.status === "finished") {
    return (
      <main className="min-h-screen bg-red-600 flex items-center justify-center text-center text-white">
        <div>
          <div className="text-9xl mb-10">
            🏆
          </div>

          <h1 className="text-8xl font-black">
            DAS QUIZ IST BEENDET!
          </h1>

          <p className="text-4xl mt-8 font-bold">
            Danke fürs Mitspielen!
          </p>
        </div>
      </main>
    );
  }

  return null;
}
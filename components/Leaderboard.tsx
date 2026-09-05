"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface LeaderboardPlayer {
  id: string;
  name: string;
  total_points: number;
  answered_questions: number;
}

interface Props {
  gameId: string;
  limit?: number;
}

export default function Leaderboard({
  gameId,
  limit,
}: Props) {

  const [players, setPlayers] =
    useState<LeaderboardPlayer[]>([]);

  async function loadLeaderboard() {

    let query = supabase
      .from("leaderboard")
      .select("*")
      .eq("game_id", gameId)
      .order("total_points", {
        ascending: false,
      });

    if (limit) {
      query = query.limit(limit);
    }

    const { data } = await query;

    if (data) {
      setPlayers(data);
    }
  }

  useEffect(() => {

    loadLeaderboard();

    const channel = supabase
      .channel("leaderboard-updates")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "answers",
        },
        () => loadLeaderboard()
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };

  }, [gameId]);

  const medals = ["🥇", "🥈", "🥉"];

  return (

    <div className="w-full max-w-5xl mx-auto">

      <h1 className="text-5xl md:text-7xl font-black text-center mb-12">

        🏆 RANGLISTE

      </h1>

      <div className="space-y-3">

        {players.map((player, index) => (

          <div
            key={player.id}

            className="
              flex
              items-center
              justify-between
              bg-white
              text-black
              p-5
              md:p-7
              rounded-2xl
              shadow-xl
            "
          >

            <div className="flex items-center gap-5">

              <div className="text-3xl md:text-5xl w-16">

                {index < 3
                  ? medals[index]
                  : `#${index + 1}`}

              </div>

              <div>

                <div className="text-2xl md:text-4xl font-bold">

                  {player.name}

                </div>

              </div>

            </div>

            <div className="text-right">

              <div className="text-3xl md:text-5xl font-black">

                {player.total_points}

              </div>

              <div className="text-gray-500">

                Punkte

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}
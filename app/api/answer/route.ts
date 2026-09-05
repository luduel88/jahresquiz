import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      playerId,
      questionId,
      answerYear,
    } = body;

    if (!playerId || !questionId || !answerYear) {
      return NextResponse.json(
        {
          error: "Ungültige Anfrage.",
        },
        { status: 400 }
      );
    }

    const year = Number(answerYear);

    if (
      !Number.isInteger(year) ||
      year < 1800 ||
      year > 2100
    ) {
      return NextResponse.json(
        {
          error: "Ungültiges Jahr.",
        },
        { status: 400 }
      );
    }

    // --------------------------------
    // FRAGE LADEN
    // --------------------------------

    const { data: question, error: questionError } =
      await supabaseServer
        .from("questions")
        .select(
          "id, game_id, question_number, correct_year"
        )
        .eq("id", questionId)
        .single();

    if (questionError || !question) {
      return NextResponse.json(
        {
          error: "Frage nicht gefunden.",
        },
        { status: 404 }
      );
    }

    // --------------------------------
    // SPIEL LADEN
    // --------------------------------

    const { data: game, error: gameError } =
      await supabaseServer
        .from("games")
        .select("*")
        .eq("id", question.game_id)
        .single();

    if (gameError || !game) {
      return NextResponse.json(
        {
          error: "Spiel nicht gefunden.",
        },
        { status: 404 }
      );
    }

    // --------------------------------
    // PRÜFEN, OB DIE FRAGE AKTIV IST
    // --------------------------------

    if (
      game.status !== "question" ||
      game.current_question !==
        question.question_number
    ) {
      return NextResponse.json(
        {
          error:
            "Diese Frage ist nicht mehr aktiv.",
        },
        { status: 400 }
      );
    }

    // --------------------------------
    // ZEIT PRÜFEN
    // --------------------------------

    if (!game.question_started_at) {
      return NextResponse.json(
        {
          error: "Der Timer wurde nicht gestartet.",
        },
        { status: 400 }
      );
    }

    const startedAt = new Date(
      game.question_started_at
    ).getTime();

    const elapsed =
      (Date.now() - startedAt) / 1000;

    if (elapsed > 20) {
      return NextResponse.json(
        {
          error: "Die Zeit ist abgelaufen.",
        },
        { status: 400 }
      );
    }

    // --------------------------------
    // PRÜFEN, OB SPIELER EXISTIERT
    // --------------------------------

    const { data: player, error: playerError } =
      await supabaseServer
        .from("players")
        .select("id, game_id")
        .eq("id", playerId)
        .single();

    if (
      playerError ||
      !player ||
      player.game_id !== game.id
    ) {
      return NextResponse.json(
        {
          error: "Spieler nicht gefunden.",
        },
        { status: 400 }
      );
    }

    // --------------------------------
    // DOPPELTE ANTWORT VERHINDERN
    // --------------------------------

    const { data: existingAnswer } =
      await supabaseServer
        .from("answers")
        .select("id")
        .eq("player_id", playerId)
        .eq("question_id", questionId)
        .maybeSingle();

    if (existingAnswer) {
      return NextResponse.json(
        {
          error:
            "Du hast diese Frage bereits beantwortet.",
        },
        { status: 400 }
      );
    }

    // --------------------------------
    // PUNKTE SERVERSEITIG BERECHNEN
    // --------------------------------

    const difference = Math.abs(
	  year - question.correct_year
	);

	const points = Math.max(
	  0,
	  20 - difference
	);

    // --------------------------------
    // ANTWORT SPEICHERN
    // --------------------------------

    const { error: insertError } =
      await supabaseServer
        .from("answers")
        .insert({
          player_id: playerId,
          question_id: questionId,
          answer_year: year,
          points,
        });

    if (insertError) {
      console.error(insertError);

      return NextResponse.json(
        {
          error:
            "Antwort konnte nicht gespeichert werden.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Serverfehler.",
      },
      { status: 500 }
    );
  }
}
"use client";

import { useEffect, useState } from "react";

interface CountdownProps {
  startedAt: string;
  duration?: number;
  onFinished?: () => void;
}

export default function Countdown({
  startedAt,
  duration = 20,
  onFinished,
}: CountdownProps) {
  const [seconds, setSeconds] = useState(duration);

  useEffect(() => {
    let finished = false;

    function updateTimer() {
      const startTime = new Date(startedAt).getTime();
      const now = Date.now();

      const elapsed = (now - startTime) / 1000;

      const remaining = Math.max(
        0,
        Math.ceil(duration - elapsed)
      );

      setSeconds(remaining);

      if (remaining <= 0 && !finished) {
        finished = true;
        onFinished?.();
      }
    }

    updateTimer();

    const interval = setInterval(
      updateTimer,
      100
    );

    return () => clearInterval(interval);
  }, [startedAt, duration, onFinished]);

  const urgent = seconds <= 5;

  return (
    <div className="text-center">

      <div
        className={`
          text-6xl
          md:text-8xl
          font-black
          ${urgent ? "text-red-500" : "text-white"}
        `}
      >
        {seconds}
      </div>

      <div className="text-sm text-gray-400 uppercase tracking-widest">
        Sekunden
      </div>

    </div>
  );
}
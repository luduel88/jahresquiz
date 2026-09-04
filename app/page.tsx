"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function Home() {
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/play`);
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-indigo-950 flex flex-col items-center justify-center p-8 text-center text-white">

      <h1 className="text-6xl md:text-8xl font-black mb-6">
        📸 JAHRES-QUIZ
      </h1>

      <p className="text-xl md:text-3xl text-gray-300 mb-12">
        Aus welchem Jahr stammt dieses Foto?
      </p>

      {url && (
        <div className="bg-white p-8 rounded-3xl shadow-2xl">
          <QRCodeSVG
            value={url}
            size={350}
            level="H"
          />
        </div>
      )}

      <p className="mt-10 text-2xl text-gray-300">
        QR-Code scannen und mitspielen!
      </p>

    </main>
  );
}
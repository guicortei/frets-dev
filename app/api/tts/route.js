export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  const language = (searchParams.get("tl") || "en").trim();

  if (!query) {
    return new Response("Missing q parameter", { status: 400 });
  }

  const upstreamUrl = new URL("https://translate.googleapis.com/translate_tts");
  upstreamUrl.searchParams.set("ie", "UTF-8");
  upstreamUrl.searchParams.set("q", query);
  upstreamUrl.searchParams.set("tl", language);
  upstreamUrl.searchParams.set("client", "tw-ob");

  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store",
  });

  if (!upstreamResponse.ok) {
    return new Response("Upstream TTS failed", { status: 502 });
  }

  const audioBuffer = await upstreamResponse.arrayBuffer();
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}

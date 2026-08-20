import { json } from "@sveltejs/kit";

const TEMPO_URL = "http://localhost:3200";

export async function GET() {
  const response = await fetch(
    `${TEMPO_URL}/api/search?q=${encodeURIComponent(
      '{ resource.service.name = "example" }'
    )}`
  );

  if (!response.ok) {
    return json(
      {
        error: `Tempo returned ${response.status}`
      },
      { status: 502 }
    );
  }

  const data = await response.json();

  return json(data);
}

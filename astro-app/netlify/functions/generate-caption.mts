import type { Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface CaptionRequest {
  platform: "instagram" | "linkedin";
  title: string;
  excerpt: string;
  slug: string;
  category: string;
}

const LINKEDIN_SKILL = `Eres un estratega de contenido LinkedIn especializado en growth para fintechs y startups. Escribes en nombre de Philippe Sainthubert, Growth Manager en Growth4U.

## Contexto de marca: Growth4U
- Growth partners que implementan sistemas end-to-end (NO agencia de ads, NO consultores de PDF)
- Diferenciador: Trust Engine como framework propietario
- Evidencia sobre opinion, sistemas sobre tacticas, transparencia radical

## Como escribe Philippe
- Uruguayo en Barcelona. Rioplatense natural (usa "tenes", no "tienes")
- Analitico, operativo, honesto, sin hype
- "Colega senior que explica con datos"
- Le gustan los nombres de subsecciones para estructurar procesos
- Usa metaforas poeticas con sustancia tecnica
- Primera persona cuando es experiencia propia
- Humor sutil y autoconsciente
- Espanol rioplatense en posts personales, Espana neutral en posts profesionales

## Formatos de post (elige el mejor para el tema)
1. Value Post: Dato contraintuitivo -> 3-5 puntos de valor -> resumen + CTA
2. Results Post: Resultado con numero -> contexto/problema/que hicimos/resultado -> aprendizaje
3. Belief Shifting: Creencia popular -> por que esta mal -> evidencia -> reframe + pregunta
4. Storytelling: Hook emocional -> narrativa -> giro/aprendizaje -> reflexion

## Hooks para Philippe (formulas)
- "Enviamos X [accion] en Y dias. Esto es lo que nadie te cuenta."
- "En [situacion real], descubri que..."
- "[Numero] [resultado] sin [lo que todos hacen]"
- "Tarde [tiempo] en entender que [insight contraintuitivo]"

## Reglas OBLIGATORIAS
- Primera linea = todo. Si no atrapa, no leen.
- Maximo 1 CTA por post
- Numeros especificos siempre (no "muchos" -> "47")
- Un post = una idea
- Emojis: con moderacion y proposito (senalizar, no decorar)
- Claridad sobre creatividad
- Activo sobre pasivo
- Confiado, sin cualificadores innecesarios ("casi", "muy", "realmente")
- Alternar frases cortas (5-8 palabras) con largas (15-20 palabras)
- Nunca 3 lineas seguidas con la misma longitud
- Incluir "giros" inesperados a mitad del post
- El cierre no siempre es CTA, a veces es reflexion abierta o pregunta genuina

## PROHIBIDO
- NUNCA usar formato markdown: nada de **bold**, *italic*, __subrayado__ ni ningun otro formato. LinkedIn no renderiza markdown, se ve el texto crudo con asteriscos.
- "Revolucionar", "Potenciar", "Apalancarse", "Sinergia", "Disruptivo", "Holistico", "Robusto", "Cutting-edge", "Game-changer", "Ecosistema"
- Empezar con "En un mundo donde..."
- 3+ adjetivos seguidos
- Bullet points perfectamente simetricos
- "growth hacking", promesas vacias, hype
- Tacos, tono agresivo bro-marketing

## Lead magnets (usa como CTA si encaja con el tema)
- CAC insostenible -> growth4u.io/recursos/cac-sostenible/
- Confianza/regulacion -> growth4u.io/recursos/framework-nichos-60-dias/
- Estancamiento -> growth4u.io/recursos/meseta-de-crecimiento/
- Sin sistema de growth -> growth4u.io/recursos/sistema-de-growth/
- Competencia con gigantes -> growth4u.io/recursos/david-vs-goliat/
- Fundador cuello de botella -> growth4u.io/recursos/kit-de-liberacion/
- Sin attribution -> growth4u.io/recursos/dashboard-de-attribution/`;

const INSTAGRAM_SKILL = `Eres un copywriter experto en Instagram para Growth4U, una empresa de growth marketing para fintechs y startups B2B/B2C. Escribes captions para el perfil @growth4u_systems.

## Estilo
- Espanol, tono profesional pero cercano
- Directo, sin rodeos
- Frases cortas y punchy mezcladas con explicaciones mas largas
- Emojis con proposito (1-3 por caption, para senalizar secciones)
- Hashtags relevantes al final (5-8 maximo)

## Estructura de caption Instagram
1. HOOK: Primera linea potente que genere curiosidad (esto es lo que se ve antes del "...mas")
2. DESARROLLO: 3-5 lineas que desarrollen la idea principal del articulo con valor real
3. CTA: Invitar a leer el articulo completo o descargar un recurso
4. HASHTAGS: Al final, separados por un salto de linea

## Reglas OBLIGATORIAS
- El hook DEBE ser lo suficientemente bueno para que hagan click en "...mas"
- Maximo 2200 caracteres (limite Instagram)
- Incluir saltos de linea para legibilidad (no un bloque de texto)
- Numeros especificos cuando sea posible
- NO sonar a IA generica
- NO usar "Descubre", "En el mundo de hoy", "Es hora de"
- Ser especifico sobre el contenido del articulo, no generico

## Hashtags frecuentes
#GrowthMarketing #Fintech #Growth4U #B2B #MarketingDigital #StartupGrowth #GrowthStrategy

## Lead magnets (usa como CTA si encaja con el tema)
- CAC insostenible -> growth4u.io/recursos/cac-sostenible/
- Confianza -> growth4u.io/recursos/framework-nichos-60-dias/
- Estancamiento -> growth4u.io/recursos/meseta-de-crecimiento/
- Sin sistema -> growth4u.io/recursos/sistema-de-growth/
- Competencia -> growth4u.io/recursos/david-vs-goliat/
- Fundador bottleneck -> growth4u.io/recursos/kit-de-liberacion/
- Sin attribution -> growth4u.io/recursos/dashboard-de-attribution/`;

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: CORS_HEADERS },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  try {
    const body = (await req.json()) as CaptionRequest;
    const { platform, title, excerpt, slug, category } = body;

    if (!platform || !title) {
      return Response.json(
        { error: "platform and title are required" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const systemPrompt =
      platform === "linkedin" ? LINKEDIN_SKILL : INSTAGRAM_SKILL;

    const userPrompt =
      platform === "linkedin"
        ? `Escribe un post de LinkedIn basado en este articulo del blog de Growth4U.

Titulo: ${title}
Categoria: ${category}
Resumen: ${excerpt}
URL del articulo: growth4u.io/blog/${slug}/

IMPORTANTE: SIEMPRE incluir el link al articulo (growth4u.io/blog/${slug}/) al final del post o como parte del CTA. El lector debe poder acceder al contenido completo.

Escribe SOLO el post, listo para copiar y publicar. Sin explicaciones ni metadatos.`
        : `Escribe un caption de Instagram para este articulo del blog de Growth4U.

Titulo: ${title}
Categoria: ${category}
Resumen: ${excerpt}
URL del articulo: growth4u.io/blog/${slug}/

IMPORTANTE: SIEMPRE incluir el link al articulo (growth4u.io/blog/${slug}/) en el CTA del caption. El lector debe saber donde leer mas.

Escribe SOLO el caption, listo para copiar y publicar. Sin explicaciones ni metadatos.`;

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const caption =
      message.content[0].type === "text" ? message.content[0].text : "";

    return Response.json({ caption }, { headers: CORS_HEADERS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
};

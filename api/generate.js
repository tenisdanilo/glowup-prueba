const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.CLAVE_API_DE_OPENAI,
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { prompt, type } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Falta el texto o la idea (prompt).' });
    }

    if (type === 'image') {
      const cleanPrompt = encodeURIComponent(prompt.trim());
      const imageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=800&height=800&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
      return res.status(200).json({ result: imageUrl });
    } else {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Eres un productor y guionista experto en creación de contenidos digitales." },
          { role: "user", content: prompt }
        ],
      });
      return res.status(200).json({ result: completion.choices[0].message.content });
    }

  } catch (error) {
    console.error("Error general en la API:", error);
    return res.status(500).json({ error: error.message || 'Error de conexión.' });
  }
};
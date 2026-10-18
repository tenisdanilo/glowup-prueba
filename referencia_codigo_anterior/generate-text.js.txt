generate-text.js

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const { prompt } = req.body;
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'Falta configurar OPENAI_API_KEY en Vercel.' });
        }

        if (!prompt) {
            return res.status(400).json({ error: 'El prompt es obligatorio.' });
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (data.error) {
            return res.status(500).json({ error: data.error.message });
        }

        const textResponse = data.choices[0].message.content;
        return res.status(200).json({ text: textResponse });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
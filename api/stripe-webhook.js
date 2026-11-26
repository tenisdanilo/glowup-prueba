
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_missing');

const PACKAGES = {
  guionista: {
    price: process.env.STRIPE_PRICE_GUIONISTA,
    amount: 990
  },
  creador_visual: {
    price: process.env.STRIPE_PRICE_CREADOR_VISUAL,
    amount: 1490
  },
  proyecto_completo: {
    price: process.env.STRIPE_PRICE_PROYECTO_COMPLETO,
    amount: 1990
  }
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const required = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'STRIPE_PRICE_GUIONISTA',
    'STRIPE_PRICE_CREADOR_VISUAL',
    'STRIPE_PRICE_PROYECTO_COMPLETO'
  ];

  if (required.some(name => !process.env[name])) {
    return res.status(503).json({ error: 'Configuracion incompleta' });
  }

  let event;

  try {
    const signature = req.headers['stripe-signature'];
   
const rawBody = await new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;

  req.on('data', chunk => {
    size += chunk.length;

    if (size > 1024 * 1024) {
      reject(new Error('Notificacion demasiado grande'));
      return;
    }

    chunks.push(chunk);
  });

  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});


    if (!signature ||
        !(typeof rawBody === 'string' || Buffer.isBuffer(rawBody))) {
      return res.status(400).json({
        error: 'No se recibio el contenido original verificable'
      });
    }

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error('Firma de Stripe no valida:', error.message);
    return res.status(400).json({ error: 'Firma no valida' });
  }

  const acceptedEvents = [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded'
  ];

  if (!acceptedEvents.includes(event.type)) {
    return res.status(200).json({ received: true });
  }

  try {
    const incoming = event.data.object;

    // Solo aceptamos pagos del entorno de pruebas.
    if (event.livemode || incoming.livemode) {
      return res.status(400).json({ error: 'Pago real no admitido' });
    }

    // Consultamos los datos actuales directamente a Stripe.
    const session = await stripe.checkout.sessions.retrieve(
      incoming.id,
      { expand: ['line_items'] }
    );

    if (session.livemode ||
        session.mode !== 'payment' ||
        session.payment_status !== 'paid' ||
        session.currency !== 'eur') {
      return res.status(400).json({ error: 'Pago no valido' });
    }

    const items = session.line_items?.data || [];

    if (items.length !== 1 || items[0].quantity !== 1) {
      return res.status(400).json({ error: 'Compra no reconocida' });
    }

    const entry = Object.entries(PACKAGES).find(
      ([, packageData]) =>
        packageData.price === items[0].price?.id
    );

    if (!entry) {
      return res.status(400).json({ error: 'Precio desconocido' });
    }

    const [packageCode, packageData] = entry;

    if (session.amount_total !== packageData.amount) {
      return res.status(400).json({ error: 'Importe incorrecto' });
    }

    // El identificador debe venir de un usuario autenticado.
    const userId = session.client_reference_id;
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!userId || !uuidPattern.test(userId) ||
        (session.metadata?.user_id &&
         session.metadata.user_id !== userId)) {
      return res.status(400).json({ error: 'Usuario no valido' });
    }

    // Supabase registra el pedido y sus creditos atomicamente.
    const url = process.env.SUPABASE_URL.replace(/\/$/, '') +
      '/rest/v1/rpc/credit_paid_order';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SECRET_KEY
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_stripe_session_id: session.id,
        p_package_code: packageCode
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Error al acreditar en Supabase:', detail);
      return res.status(500).json({
        error: 'No se pudieron acreditar los creditos'
      });
    }

    const credited = await response.json();

    return res.status(200).json({
      received: true,
      credited: credited === true
    });

  } catch (error) {
    console.error('Error al procesar el pago:', error.message);
    return res.status(500).json({ error: 'Error procesando pago' });
  }
};
module.exports.config = {
  api: {
    bodyParser: false
  }
};

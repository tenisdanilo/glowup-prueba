
const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Metodo no permitido'
    });
  }

  const {
    STRIPE_SECRET_KEY,
    STRIPE_PRICE_GUIONISTA,
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  } = process.env;

  if (
    !STRIPE_SECRET_KEY?.startsWith('sk_test_') ||
    !STRIPE_PRICE_GUIONISTA ||
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY
  ) {
    return res.status(503).json({
      error: 'Configuracion de pruebas incompleta'
    });
  }

  // El usuario debe estar autenticado.
  const authorization = req.headers.authorization || '';
  const tokenMatch = authorization.match(/^Bearer (.+)$/i);

  if (!tokenMatch) {
    return res.status(401).json({
      error: 'Inicia sesion antes de comprar'
    });
  }

  try {
    // Comprobar la identidad directamente con Supabase.
    const authResponse = await fetch(
      SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user',
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: 'Bearer ' + tokenMatch[1]
        }
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({
        error: 'Sesion no valida o caducada'
      });
    }

    const user = await authResponse.json();

    if (!user.id || !user.email_confirmed_at) {
      return res.status(403).json({
        error: 'Debes confirmar tu cuenta'
      });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);

    // Verificar el producto antes de crear la compra.
    const price = await stripe.prices.retrieve(
      STRIPE_PRICE_GUIONISTA
    );

    if (
      !price.active ||
      price.livemode ||
      price.unit_amount !== 990 ||
      price.currency !== 'eur' ||
      price.type !== 'one_time'
    ) {
      return res.status(503).json({
        error: 'Precio de pruebas no valido'
      });
    }

    // Stripe recibe el ID verificado del usuario.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: STRIPE_PRICE_GUIONISTA,
          quantity: 1
        }
      ],
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        package_code: 'guionista'
      },
      success_url:
        'https://glowup-prueba.vercel.app/cuenta.html?checkout=success',
      cancel_url:
        'https://glowup-prueba.vercel.app/precios.html?checkout=cancel'
     
    });

    return res.status(200).json({
      url: session.url
    });

  } catch (error) {
    console.error('Error creando Checkout:', error.message);

    return res.status(500).json({
      error: 'No se pudo preparar la compra'
    });
  }
};

import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// API Keys e Configurações via variáveis de ambiente
const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_eNSSxKCT_8yjn8L7VaEYnST4RijKDANBj";

// Placeholders para API SkyPostal (Cole suas chaves futuramente em .env ou diretamente abaixo)
const SKYPOSTAL_API_KEY = process.env.SKYPOSTAL_API_KEY || "";
const SKYPOSTAL_API_URL = process.env.SKYPOSTAL_API_URL || "https://api.skypostal.com/v1"; 

/**
 * 1. Endpoint Integración SkyPostal
 * POST /api/skypostal/crear-y-confirmar
 */
app.post('/api/skypostal/crear-y-confirmar', async (req, res) => {
  try {
    const { pedido, origen } = req.body;

    if (!pedido || !origen) {
      return res.status(400).json({ error: "Faltan datos requeridos (pedido u origen)." });
    }

    // Validación de registros duplicados
    if (pedido.skyPostal_service_id) {
      return res.status(400).json({ 
        error: "El pedido ya posee un envío registrado en SkyPostal.",
        serviceId: pedido.skyPostal_service_id 
      });
    }

    // Validación de campos obligatorios del pedido y entrega
    const env = pedido.datosEnvio || {};
    if (!env.nombre || !env.telefono || !env.direccion || !env.ciudad) {
      return res.status(400).json({ error: "Datos de entrega incompletos en el pedido." });
    }

    // Estructura oficial Payload SkyPostal
    const skyPostalPayload = {
      origin: {
        name: origen.nombre || "FEMA S.A.",
        phone: origen.telefono || "021123456",
        email: origen.email || "logistica@fema.com.py",
        address: origen.direccion || "Asunción",
        city: origen.ciudad || "Asunción",
        city_id: origen.city_id || 1
      },
      destination: {
        name: env.nombre,
        phone: env.telefono,
        email: pedido.userEmail,
        address: env.direccion,
        city: env.ciudad,
        city_id: env.city_id || 1,
        reference: env.referencia || ""
      },
      packages: [
        {
          weight_kg: 1.0,
          description: `Pedido #${pedido.id} FEMA`,
          declared_value: pedido.total || 0
        }
      ]
    };

    // Si la API Key de SkyPostal aún no se configuró, devuelve mock seguro para pruebas
    if (!SKYPOSTAL_API_KEY) {
      console.warn("⚠️ SKYPOSTAL_API_KEY no configurada. Retornando respuesta simulada de éxito.");
      const mockServiceId = "SP-" + Date.now();
      const mockTracking = "TRK-FEMA-" + Math.floor(100000 + Math.random() * 900000);
      return res.json({
        success: true,
        serviceId: mockServiceId,
        tracking: mockTracking,
        estadoEnvio: "Servicio Confirmado (Modo Demo SkyPostal)"
      });
    }

    // Llamada oficial a la API de SkyPostal
    const responseSky = await fetch(`${SKYPOSTAL_API_URL}/shipments/create-and-confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SKYPOSTAL_API_KEY}`
      },
      body: JSON.stringify(skyPostalPayload)
    });

    const dataSky = await responseSky.json();

    if (!responseSky.ok) {
      return res.status(responseSky.status).json({
        error: "Error en la API de SkyPostal",
        detalles: dataSky
      });
    }

    return res.json({
      success: true,
      serviceId: dataSky.service_id || dataSky.id,
      tracking: dataSky.tracking_number || dataSky.tracking,
      estadoEnvio: "Confirmado"
    });

  } catch (error) {
    console.error("Error en /api/skypostal/crear-y-confirmar:", error);
    return res.status(500).json({ error: "Error interno del servidor", detalles: error.message });
  }
});

/**
 * 2. Endpoint Envio de E-mails via Resend
 * POST /api/emails/notificar-pedido
 */
app.post('/api/emails/notificar-pedido', async (req, res) => {
  try {
    const { destinatarios, pedido, trackingInfo, fromEmail, fromName } = req.body;

    if (!destinatarios || !Array.isArray(destinatarios) || destinatarios.length === 0) {
      return res.status(400).json({ error: "No hay destinatarios activos configurados." });
    }

    const senderName = fromName || "FEMA Sistema";
    // Nota: Resend requiere un dominio verificado para enviar desde emails personalizados.
    // Usamos onboarding@resend.dev como fallback válido si no hay un correo con dominio propio.
    const senderEmail = (fromEmail && fromEmail.includes('@')) ? fromEmail : "onboarding@resend.dev";

    const env = pedido.datosEnvio || {};
    const itemsHtml = (pedido.items || []).map(i => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${i.producto} (${i.aroma})</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${i.cantidad}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₲ ${(i.subtotal || 0).toLocaleString('es-PY')}</td>
      </tr>
    `).join('');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #E4283C; text-align: center;">¡Confirmación de Pedido y Envío!</h2>
        <p>Se ha procesado y confirmado el siguiente pedido en <strong>FEMA</strong>:</p>
        
        <div style="background-color: #f9f9f9; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
          <p><strong>ID del Pedido:</strong> #${pedido.id}</p>
          <p><strong>Cliente:</strong> ${pedido.userEmail}</p>
          <p><strong>Fecha:</strong> ${pedido.fecha}</p>
        </div>

        <h3>📦 Información de Envío (SkyPostal)</h3>
        <div style="background-color: #eef9f2; padding: 12px; border-radius: 6px; border: 1px solid #25D366; margin-bottom: 16px;">
          <p><strong>Service ID:</strong> ${trackingInfo?.serviceId || 'N/A'}</p>
          <p><strong>Número de Tracking:</strong> ${trackingInfo?.tracking || 'N/A'}</p>
          <p><strong>Estado:</strong> ${trackingInfo?.estadoEnvio || 'Confirmado'}</p>
          <p><strong>Destinatario:</strong> ${env.nombre} (${env.telefono})</p>
          <p><strong>Dirección:</strong> ${env.direccion}, ${env.ciudad}</p>
        </div>

        <h3>Resumen del Pedido</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="padding: 8px; text-align: left;">Producto</th>
              <th style="padding: 8px; text-align: center;">Cant.</th>
              <th style="padding: 8px; text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <h3 style="text-align: right; color: #E4283C; margin-top: 16px;">
          Total: ₲ ${(pedido.total || 0).toLocaleString('es-PY')}
        </h3>

        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 11px; color: #777; text-align: center;">
          FEMA — Higiene y Bienestar. Asunción, Paraguay.
        </p>
      </div>
    `;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: destinatarios,
        subject: `[FEMA] Pedido #${pedido.id} Confirmado - Tracking: ${trackingInfo?.tracking || 'N/A'}`,
        html: htmlBody
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return res.status(resendResponse.status).json({
        error: "Error al enviar correo vía Resend",
        detalles: resendData
      });
    }

    return res.json({ success: true, data: resendData });

  } catch (error) {
    console.error("Error en /api/emails/notificar-pedido:", error);
    return res.status(500).json({ error: "Error interno en servidor de correos", detalles: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend FEMA ejecutándose en el puerto ${PORT}`);
});
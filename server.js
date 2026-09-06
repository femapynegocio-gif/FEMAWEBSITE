require('dotenv').config();
const express = require('express');
const axios = require('axios');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const SKYPOSTAL_API_KEY = process.env.SKYPOSTAL_API_KEY || '';
const SKYPOSTAL_BASE_URL = process.env.SKYPOSTAL_BASE_URL || 'https://clientes.skypostal.com.py';

// Transporte de Email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

// Crear y Confirmar Envío SkyPostal
app.post('/api/skypostal/crear-y-confirmar', async (req, res) => {
  try {
    const { pedido, origen } = req.body;

    if (!pedido || !pedido.datosEnvio) {
      return res.status(400).json({ error: 'Datos de envío o pedido incompletos.' });
    }

    // 1. Crear Servicio
    const payloadCreacion = {
      tipo_de_envio: 0,
      weight: pedido.pesoTotal || 1,
      origin_name: origen.nombre,
      origin_phone: origen.telefono,
      origin_email: origen.email,
      origin_address: origen.direccion,
      origin_city_id: parseInt(origen.city_id) || 1,
      receiver_name: pedido.datosEnvio.nombre,
      receiver_phone: pedido.datosEnvio.telefono,
      receiver_address: pedido.datosEnvio.direccion,
      receiver_city_id: parseInt(pedido.datosEnvio.city_id) || 1
    };

    const resCreacion = await axios.post(`${SKYPOSTAL_BASE_URL}/api/servicio`, payloadCreacion, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${SKYPOSTAL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const serviceId = resCreacion.data?.data?.id;
    const tracking = resCreacion.data?.data?.tracking;

    if (!serviceId) {
      return res.status(500).json({ error: 'No se obtuvo ID del servicio de SkyPostal.' });
    }

    // 2. Confirmar Servicio
    await axios.post(`${SKYPOSTAL_BASE_URL}/api/servicio/${serviceId}/confirmar`, {}, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${SKYPOSTAL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return res.json({
      success: true,
      serviceId,
      tracking,
      estadoEnvio: 'Servicio confirmado'
    });

  } catch (error) {
    console.error('Error SkyPostal:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Error al procesar con SkyPostal',
      detalles: error.response?.data || error.message
    });
  }
});

// Enviar Notificación por Email
app.post('/api/emails/notificar-pedido', async (req, res) => {
  try {
    const { destinatarios, pedido, trackingInfo } = req.body;

    if (!destinatarios || destinatarios.length === 0) {
      return res.status(400).json({ error: 'No hay destinatarios configurados.' });
    }

    const itemsHtml = pedido.items.map(i => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${i.producto} (${i.aroma || 'N/A'})</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${i.cantidad}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₲ ${(i.precioUnitario || 0).toLocaleString('es-PY')}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₲ ${(i.subtotal || 0).toLocaleString('es-PY')}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px;">
        <h2 style="color: #E4283C; text-align: center;">Pedido Aceptado / Confirmado</h2>
        <p><strong>Número de Pedido:</strong> #${pedido.id}</p>
        <p><strong>Fecha:</strong> ${pedido.fecha}</p>
        <p><strong>Cliente:</strong> ${pedido.userEmail}</p>
        
        <h3>Productos</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f4f2ee;">
              <th style="padding: 8px; border: 1px solid #ddd;">Producto</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Cant.</th>
              <th style="padding: 8px; border: 1px solid #ddd;">P. Unit</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        
        <p style="text-align: right; font-size: 16px;"><strong>Total: ₲ ${pedido.total.toLocaleString('es-PY')}</strong></p>
        
        <h3>Datos de Entrega</h3>
        <p>
          <strong>Destinatario:</strong> ${pedido.datosEnvio?.nombre}<br>
          <strong>Teléfono:</strong> ${pedido.datosEnvio?.telefono}<br>
          <strong>Dirección:</strong> ${pedido.datosEnvio?.direccion}<br>
          <strong>Ciudad:</strong> ${pedido.datosEnvio?.ciudad}<br>
          <strong>Referencia:</strong> ${pedido.datosEnvio?.referencia || 'N/A'}
        </p>

        <h3>Información de Envío</h3>
        <p>
          <strong>Transportadora:</strong> SkyPostal<br>
          <strong>Service ID:</strong> ${trackingInfo.serviceId}<br>
          <strong>Tracking:</strong> ${trackingInfo.tracking}<br>
          <strong>Estado de Envío:</strong> ${trackingInfo.estadoEnvio}
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"FEMA Sistema" <${process.env.SMTP_USER}>`,
      to: destinatarios.join(','),
      subject: `Pedido #${pedido.id} Aceptado - SkyPostal ${trackingInfo.tracking}`,
      html: htmlContent
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error enviando email:', error);
    res.status(500).json({ error: 'Fallo al enviar correo electrónico.', detalles: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en el puerto ${PORT}`));
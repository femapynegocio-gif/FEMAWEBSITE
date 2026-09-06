require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(express.json());

const resend = new Resend(process.env.RESEND_API_KEY);
const SKYPOSTAL_URL = process.env.SKYPOSTAL_API_URL || 'https://clientes.skypostal.com.py/api';
const SKYPOSTAL_KEY = process.env.SKYPOSTAL_API_KEY;

// Headers para autenticação SkyPostal
const skyHeaders = () => ({
  headers: {
    'Authorization': `Bearer ${SKYPOSTAL_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// 1. Obter Cidades do SkyPostal
app.get('/api/skypostal/ciudades', async (req, res) => {
  try {
    const response = await axios.get(`${SKYPOSTAL_URL}/ciudades`, skyHeaders());
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

// 2. Calcular Frete
app.get('/api/skypostal/calculadora', async (req, res) => {
  const { tipo_de_envio, city_id, weight } = req.query;
  try {
    const response = await axios.get(`${SKYPOSTAL_URL}/calculadora`, {
      ...skyHeaders(),
      params: { tipo_de_envio, city_id, weight }
    });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

// 3. Criar Envio na SkyPostal
app.post('/api/skypostal/servicio', async (req, res) => {
  try {
    const response = await axios.post(`${SKYPOSTAL_URL}/servicio`, req.body, skyHeaders());
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { message: err.message });
  }
});

// 4. Envio de Email via Resend
app.post('/api/send-email', async (req, res) => {
  const { to, subject, html } = req.body;
  try {
    const data = await resend.emails.send({
      from: 'FEMA Sistema <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
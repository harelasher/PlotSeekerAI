require('dotenv').config();

const express = require('express');
const cors = require('cors');
const searchRoutes = require('./routes/search');
const { initScheduler } = require('./services/scheduler');

const { initDatabase } = require('./services/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['https://plotseekerai.com', 'https://www.plotseekerai.com', 'https://plotseekerai-1.onrender.com', 'http://localhost:5173'], 
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api', searchRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

async function startServer() {
  // 1. Initialize database first
  await initDatabase();

  // 2. Start listening on all interfaces to ensure cross-platform connectivity
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PlotSeekerAI server running on port ${PORT}`);

    // 3. Start the background refresh scheduler AFTER server is up and DB is ready
    initScheduler();
  });
}

startServer();

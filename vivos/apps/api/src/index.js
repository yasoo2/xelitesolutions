const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/viva-store')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Viva Store API is running', 
    version: '1.0.0',
    status: 'healthy' 
  });
});

app.get('/api/products', (req, res) => {
  // Mock Data
  res.json([
    { id: 1, name: 'Pro Football', price: 29.99, category: 'Sports', image: 'https://placehold.co/400x300?text=Ball' },
    { id: 2, name: 'Running Shoes', price: 89.99, category: 'Apparel', image: 'https://placehold.co/400x300?text=Shoes' },
    { id: 3, name: 'Gym Bag', price: 45.00, category: 'Accessories', image: 'https://placehold.co/400x300?text=Bag' },
  ]);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

const mongoose = require('mongoose');
const config = require('../config/env.config');

class Database {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      if (this.connection) {
        return this.connection;
      }

      const options = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      };

      this.connection = await mongoose.connect(config.MONGODB_URI, options);
      
      console.log('✅ Conectado a MongoDB');
      
      // Eventos de conexión
      mongoose.connection.on('error', (error) => {
        console.error('❌ Error de conexión a MongoDB:', error);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('📡 Desconectado de MongoDB');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 Reconectado a MongoDB');
      });

      return this.connection;
    } catch (error) {
      console.error('❌ Error al conectar a MongoDB:', error);
      process.exit(1);
    }
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
      this.connection = null;
      console.log('📡 Desconectado de MongoDB');
    }
  }
}

module.exports = new Database(); 
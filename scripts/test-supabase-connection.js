// Script para probar conexión a Supabase
// Ejecutar: node scripts/test-supabase-connection.js

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local if exists
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Faltan credenciales');
  console.error('');
  console.error('Crea un archivo .env.local con:');
  console.error('SUPABASE_URL=https://xxxxx.supabase.co');
  console.error('SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...');
  console.error('');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testConnection() {
  console.log('🔌 Probando conexión a Supabase...\n');
  console.log(`URL: ${SUPABASE_URL}\n`);

  try {
    // Test 1: Basic connection
    console.log('1️⃣ Probando conexión básica...');
    const { data: health, error: healthError } = await supabase
      .from('clients')
      .select('id')
      .limit(1);
    
    if (healthError) {
      console.error('❌ Error de conexión:', healthError.message);
      return;
    }
    console.log('✅ Conexión exitosa!\n');

    // Test 2: Count records
    console.log('2️⃣ Contando registros...');
    const tables = [
      'clients',
      'transactions',
      'subscriptions',
      'invoices',
      'sync_runs',
      'ghl_contacts_raw',
      'manychat_contacts_raw'
    ];

    for (const table of tables) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          console.log(`   ⚠️  ${table}: Error - ${error.message}`);
        } else {
          console.log(`   ✅ ${table}: ${count || 0} registros`);
        }
      } catch (err) {
        console.log(`   ⚠️  ${table}: No existe o sin acceso`);
      }
    }

    // Test 3: Database size (if possible)
    console.log('\n3️⃣ Información de la base de datos...');
    const { data: dbInfo, error: dbError } = await supabase.rpc('pg_database_size', {
      database_name: 'postgres'
    }).catch(() => ({ data: null, error: { message: 'Función no disponible' } }));

    if (!dbError && dbInfo) {
      console.log(`   📊 Tamaño aproximado: ${(dbInfo / 1024 / 1024).toFixed(2)} MB`);
    } else {
      console.log('   ℹ️  Información de tamaño no disponible');
    }

    // Test 4: Check admin access
    console.log('\n4️⃣ Verificando permisos de administrador...');
    const { data: adminCheck, error: adminError } = await supabase.rpc('is_admin').catch(() => ({ data: null, error: { message: 'Función no disponible' } }));
    
    if (!adminError) {
      console.log('   ✅ Acceso a funciones RPC disponible');
    } else {
      console.log('   ⚠️  Algunas funciones RPC pueden no estar disponibles');
    }

    console.log('\n✅ Todas las pruebas completadas!');
    console.log('\n📋 Resumen:');
    console.log(`   URL: ${SUPABASE_URL}`);
    console.log(`   Estado: Conectado y funcionando`);
    console.log(`   Service Role Key: ${SUPABASE_KEY.substring(0, 20)}...`);

  } catch (error) {
    console.error('❌ Error inesperado:', error.message);
    console.error(error.stack);
  }
}

testConnection();

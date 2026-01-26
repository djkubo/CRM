// Script para exportar todos los contactos de ManyChat a CSV
// Ejecutar: node export-manychat-contacts.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANYCHAT_API_KEY = '2187832708134847:9e5a8ee8657c3eb86d9cbcf55d516ab2';
const RATE_LIMIT_DELAY = 150; // ms between requests (ManyChat limit ~10 req/sec)

async function exportManyChatContacts() {
  console.log('🚀 Iniciando exportación de contactos ManyChat...\n');
  console.log('API Key:', MANYCHAT_API_KEY.substring(0, 20) + '...\n');

  const allSubscribers = [];
  const processedEmails = new Set();
  let requestCount = 0;
  let foundCount = 0;
  let notFoundCount = 0;

  // ManyChat no tiene endpoint para listar todos, así que necesitamos:
  // Opción 1: Buscar por emails conocidos (si tienes una lista)
  // Opción 2: Usar tags para encontrar grupos de suscriptores
  // Opción 3: Exportar desde ManyChat dashboard manualmente

  console.log('⚠️  ManyChat API no tiene endpoint para listar todos los suscriptores.');
  console.log('📋 Opciones disponibles:\n');
  console.log('1. Buscar por lista de emails (si tienes una)');
  console.log('2. Buscar por tags (si tienes tags organizados)');
  console.log('3. Exportar manualmente desde ManyChat Dashboard\n');

  // OPCIÓN 1: Buscar por lista de emails desde un CSV de clientes existentes
  // Lee emails desde un archivo CSV si existe
  let emailsToSearch = [];
  const clientsCsvPath = path.join(__dirname, 'clients-emails.csv');
  
  if (fs.existsSync(clientsCsvPath)) {
    console.log('📄 Leyendo emails desde clients-emails.csv...');
    const csvContent = fs.readFileSync(clientsCsvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0]?.split(',').map(h => h.trim().toLowerCase()) || [];
    const emailIndex = headers.findIndex(h => h.includes('email'));
    
    if (emailIndex >= 0) {
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const email = values[emailIndex];
        if (email && email.includes('@')) {
          emailsToSearch.push(email);
        }
      }
      console.log(`✅ ${emailsToSearch.length} emails cargados desde CSV\n`);
    }
  }
  
  // OPCIÓN 2: Si tienes una lista de emails directamente, úsala aquí
  // Descomenta y agrega tus emails:
  // emailsToSearch = ['email1@example.com', 'email2@example.com'];
  
  // OPCIÓN 3: Buscar desde la base de datos (si tienes acceso)
  // Puedes exportar emails desde Supabase y crear clients-emails.csv

  if (emailsToSearch.length === 0) {
    console.log('❌ No hay emails para buscar.');
    console.log('\n💡 INSTRUCCIONES:');
    console.log('   1. Crea un archivo "clients-emails.csv" con una columna "email"');
    console.log('   2. O edita este script y agrega emails en emailsToSearch[]');
    console.log('   3. O exporta manualmente desde ManyChat Dashboard\n');
    console.log('📝 Formato de clients-emails.csv:');
    console.log('   email');
    console.log('   user1@example.com');
    console.log('   user2@example.com\n');
    return;
  }

  // Buscar por emails
  if (emailsToSearch.length > 0) {
    console.log(`📧 Buscando ${emailsToSearch.length} emails en ManyChat...\n`);
    
    for (const email of emailsToSearch) {
      if (processedEmails.has(email.toLowerCase())) {
        continue;
      }
      
      requestCount++;
      processedEmails.add(email.toLowerCase());
      
      try {
        const encodedEmail = encodeURIComponent(email);
        const url = `https://api.manychat.com/fb/subscriber/findBySystemField?field_name=email&field_value=${encodedEmail}`;
        
        console.log(`📥 [${requestCount}] Buscando: ${email.substring(0, 30)}...`);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${MANYCHAT_API_KEY}`,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          if (response.status === 404) {
            notFoundCount++;
            console.log(`   ❌ No encontrado`);
          } else {
            console.log(`   ⚠️  Error ${response.status}`);
            notFoundCount++;
          }
        } else {
          const data = await response.json();
          
          if (data.status === 'success' && data.data) {
            const subscriber = data.data;
            allSubscribers.push(subscriber);
            foundCount++;
            console.log(`   ✅ Encontrado: ${subscriber.id}`);
          } else {
            notFoundCount++;
            console.log(`   ❌ No encontrado`);
          }
        }

        // Rate limiting
        if (requestCount < emailsToSearch.length) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }

      } catch (error) {
        console.error(`   ❌ Error:`, error.message);
        notFoundCount++;
      }
    }
  }

  // Buscar por tags (si implementamos)
  if (tagsToSearch.length > 0) {
    console.log(`\n🏷️  Buscando por tags: ${tagsToSearch.join(', ')}`);
    console.log('⚠️  Búsqueda por tags no implementada aún (ManyChat API limitación)');
  }

  console.log(`\n📊 Resumen:`);
  console.log(`   Total requests: ${requestCount}`);
  console.log(`   Encontrados: ${foundCount}`);
  console.log(`   No encontrados: ${notFoundCount}`);
  console.log(`   Total suscriptores: ${allSubscribers.length}\n`);

  if (allSubscribers.length === 0) {
    console.log('❌ No se encontraron suscriptores');
    return;
  }

  // Convert to CSV
  const headers = [
    'id',
    'email',
    'phone',
    'whatsapp_phone',
    'first_name',
    'last_name',
    'name',
    'tags',
    'optin_email',
    'optin_sms',
    'optin_whatsapp',
    'created_at',
    'updated_at',
    'custom_fields'
  ];

  const csvRows = [headers.join(',')];

  for (const subscriber of allSubscribers) {
    const tags = Array.isArray(subscriber.tags) 
      ? subscriber.tags.map(t => (typeof t === 'string' ? t : t.name || '')).join(';')
      : '';
    
    const customFields = subscriber.custom_fields 
      ? JSON.stringify(subscriber.custom_fields)
      : '';

    const row = [
      subscriber.id || '',
      subscriber.email || '',
      subscriber.phone || '',
      subscriber.whatsapp_phone || '',
      subscriber.first_name || '',
      subscriber.last_name || '',
      subscriber.name || '',
      tags,
      subscriber.optin_email ? 'true' : 'false',
      subscriber.optin_sms ? 'true' : 'false',
      subscriber.optin_whatsapp ? 'true' : 'false',
      subscriber.created_at || '',
      subscriber.updated_at || '',
      customFields
    ].map(field => {
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    
    csvRows.push(row.join(','));
  }

  const csvContent = csvRows.join('\n');

  // Save to file
  const filename = `manychat-contacts-${new Date().toISOString().split('T')[0]}.csv`;
  const filepath = path.join(__dirname, filename);
  
  fs.writeFileSync(filepath, csvContent, 'utf8');

  console.log(`✅ CSV creado exitosamente!`);
  console.log(`📁 Archivo: ${filepath}`);
  console.log(`📊 Total de filas: ${csvRows.length} (${allSubscribers.length} suscriptores + 1 header)`);
  console.log(`💾 Tamaño: ${(csvContent.length / 1024).toFixed(2)} KB\n`);
}

// Run export
exportManyChatContacts();

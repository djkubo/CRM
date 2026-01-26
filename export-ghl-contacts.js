// Script para exportar todos los contactos de GHL a CSV
// Ejecutar: node export-ghl-contacts.js

const GHL_PIT = 'pit-abc2f4ce-056f-444c-9171-4543db373530';
const GHL_LOCATION_ID = 'kIG3EUjfgGLoNW0QsJLS';
const CONTACTS_PER_PAGE = 100;
const MAX_PAGES = 1000; // Safety limit

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportGHLContacts() {
  console.log('🚀 Iniciando exportación de contactos GHL...\n');
  console.log('Location ID:', GHL_LOCATION_ID);
  console.log('PIT:', GHL_PIT.substring(0, 20) + '...\n');

  const ghlUrl = 'https://services.leadconnectorhq.com/contacts/search';
  const allContacts = [];
  let searchAfterCursor = null;
  let hasMore = true;
  let pageCount = 0;

  try {
    // Fetch all contacts
    while (hasMore && pageCount < MAX_PAGES) {
      pageCount++;
      
      const bodyParams = {
        locationId: GHL_LOCATION_ID,
        pageLimit: CONTACTS_PER_PAGE
      };

      // Use searchAfter array for pagination (format: [timestamp, id])
      if (searchAfterCursor && Array.isArray(searchAfterCursor)) {
        bodyParams.searchAfter = searchAfterCursor;
      }

      console.log(`📥 Descargando página ${pageCount}...`);

      const response = await fetch(ghlUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GHL_PIT}`,
          'Version': '2021-07-28',
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyParams)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GHL API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const contacts = data.contacts || [];
      
      if (contacts.length === 0) {
        hasMore = false;
        break;
      }

      allContacts.push(...contacts);
      hasMore = contacts.length >= CONTACTS_PER_PAGE;

      // Get next cursor from last contact's searchAfter
      const lastContact = contacts[contacts.length - 1];
      if (lastContact.searchAfter && Array.isArray(lastContact.searchAfter) && lastContact.searchAfter.length >= 2) {
        searchAfterCursor = lastContact.searchAfter;
      } else {
        // Fallback: construct from dateAdded and id
        const timestamp = lastContact.dateAdded ? new Date(lastContact.dateAdded).getTime() : Date.now();
        searchAfterCursor = [timestamp, lastContact.id];
      }

      console.log(`✅ ${contacts.length} contactos descargados (Total: ${allContacts.length})`);
      
      // Save progress every 50 pages
      if (pageCount % 50 === 0) {
        console.log(`💾 Guardando progreso intermedio...`);
        await saveCSV(allContacts, true);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (pageCount >= MAX_PAGES) {
      console.warn(`⚠️  Límite de páginas alcanzado (${MAX_PAGES}), deteniendo...`);
    }

    console.log(`\n📊 Total de contactos descargados: ${allContacts.length}\n`);

    if (allContacts.length === 0) {
      console.log('❌ No se encontraron contactos');
      return;
    }

    // Save final CSV
    await saveCSV(allContacts, false);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Try to save what we have so far
    if (allContacts.length > 0) {
      console.log(`\n💾 Intentando guardar ${allContacts.length} contactos descargados antes del error...`);
      try {
        await saveCSV(allContacts, true);
        console.log('✅ CSV parcial guardado exitosamente');
      } catch (saveError) {
        console.error('❌ Error guardando CSV parcial:', saveError.message);
      }
    }
    
    process.exit(1);
  }
}

async function saveCSV(contacts, isPartial) {
  // CSV Headers
  const headers = [
      'id',
      'email',
      'phone',
      'firstName',
      'lastName',
      'contactName',
      'source',
      'type',
      'tags',
      'dateAdded',
      'dateUpdated',
      'country',
      'city',
      'state',
      'postalCode',
      'timezone',
      'dnd',
      'businessName',
      'companyName',
      'website',
      'customFields'
    ];

    // CSV Rows
    const csvRows = [headers.join(',')];

    for (const contact of allContacts) {
      const row = [
        contact.id || '',
        contact.email || '',
        contact.phone || '',
        contact.firstName || '',
        contact.lastName || '',
        contact.contactName || '',
        contact.source || '',
        contact.type || '',
        Array.isArray(contact.tags) ? contact.tags.join(';') : '',
        contact.dateAdded || '',
        contact.dateUpdated || '',
        contact.country || '',
        contact.city || '',
        contact.state || '',
        contact.postalCode || '',
        contact.timezone || '',
        contact.dnd ? 'true' : 'false',
        contact.businessName || '',
        contact.companyName || '',
        contact.website || '',
        Array.isArray(contact.customFields) ? JSON.stringify(contact.customFields) : ''
      ].map(field => {
        // Escape commas and quotes in CSV
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
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = isPartial 
      ? `ghl-contacts-${dateStr}-PARTIAL-${contacts.length}.csv`
      : `ghl-contacts-${dateStr}.csv`;
    const filepath = path.join(__dirname, filename);
    
    fs.writeFileSync(filepath, csvContent, 'utf8');

    console.log(`✅ CSV ${isPartial ? 'parcial ' : ''}creado exitosamente!`);
    console.log(`📁 Archivo: ${filepath}`);
    console.log(`📊 Total de filas: ${csvRows.length} (${contacts.length} contactos + 1 header)`);
    console.log(`💾 Tamaño: ${(csvContent.length / 1024).toFixed(2)} KB\n`);
}

// Run export
exportGHLContacts();

# GoHighLevel Credentials & API Structure

## Credentials (Internal Use Only)

**Location ID:** `kIG3EUjfgGLoNW0QsJLS`  
**PIT (Private Integration Token):** `pit-abc2f4ce-056f-444c-9171-4543db373530`

**Location Name:** Video Remixes Pack, LLC

## API Endpoint

- **Base URL:** `https://services.leadconnectorhq.com`
- **Contacts Search:** `POST /contacts/search`
- **Headers Required:**
  - `Authorization: Bearer {PIT}`
  - `Version: 2021-07-28`
  - `Content-Type: application/json`

## Contact Structure (38 Fields)

### Core Fields
- `id` (string) - Contact ID
- `email` (string | null) - Primary email
- `phone` (string | null) - Primary phone (E.164 format)
- `firstName` (string) - First name
- `lastName` (string) - Last name
- `contactName` (string) - Full name in lowercase

### Identity Fields
- `additionalEmails` (array) - Additional email addresses
- `additionalPhones` (array) - Additional phone numbers
- `phoneLabel` (string | null) - Phone label

### Metadata
- `tags` (array) - Contact tags
- `customFields` (array) - Custom field values
- `source` (string) - Source of contact
- `type` (string) - Contact type (lead, customer, etc.)
- `dateAdded` (string) - ISO timestamp
- `dateUpdated` (string) - ISO timestamp

### Location & Address
- `locationId` (string) - GHL location ID
- `address` (object | null) - Address object
- `city` (string | null)
- `state` (string | null)
- `postalCode` (string | null)
- `country` (string) - Country code
- `timezone` (string) - Timezone

### Business
- `businessName` (string | null)
- `companyName` (string | null)
- `businessId` (string | null)
- `website` (string | null)

### Opt-in/DND
- `dnd` (boolean) - Do not disturb flag
- `dndSettings` (object) - DND settings by channel
- `inboundDndSettings` (object) - Inbound DND settings

### Attribution
- `attributionSource` (object) - First attribution
- `lastAttributionSource` (object) - Last attribution
  - Contains: sessionSource, medium, mediumId, userAgent, ip, url

### Pagination
- `searchAfter` (array) - `[timestamp, id]` for pagination

### Other
- `assignedTo` (object | null) - Assigned user
- `followers` (array) - Followers
- `validEmail` (boolean | null) - Email validation status
- `dateOfBirth` (string | null) - Date of birth

## Important Notes

1. **Many contacts have `email: null` and `phone: null`** - These are skipped in sync
2. **Pagination uses `searchAfter` array** - Format: `[timestamp, id]`
3. **No `meta.hasMore` in response** - Use `contacts.length >= pageLimit` to determine if more pages exist
4. **`contactName` is the full name** - Not `name` field
5. **DND logic:** `dnd: false` means opted in, `dndSettings.channel.status === 'active'` means opted out

## API Request Example

```json
{
  "locationId": "kIG3EUjfgGLoNW0QsJLS",
  "pageLimit": 100,
  "startAfterId": "contact_id_here"  // Optional for pagination
}
```

## Secrets Configuration

In Supabase Dashboard → Settings → Secrets:
- `GHL_API_KEY` = `pit-abc2f4ce-056f-444c-9171-4543db373530`
- `GHL_LOCATION_ID` = `kIG3EUjfgGLoNW0QsJLS`

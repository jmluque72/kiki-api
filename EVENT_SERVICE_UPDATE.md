# Event Service Update

## Overview
The event service has been updated to filter events by institution and division, and return only events greater than or equal to today's date.

## Key Changes

### 1. Required Parameters
- **institucion** (required): Institution ID to filter events
- **division** (optional): Division ID to filter events

### 2. Date Filtering
- Events are automatically filtered to return only events with dates greater than or equal to today
- This ensures only current and future events are returned

### 3. Updated Event Model Structure
The Event model now uses:
- `titulo` instead of `nombre`
- `fecha` instead of `fechaInicio/fechaFin`
- `hora` for time
- `lugar` instead of `ubicacion`
- `creador` instead of `organizador`
- `institucion` instead of `cuenta`
- `division` for division filtering
- `participantes` as a simple array of user IDs

## API Endpoints

### Get All Events
```
GET /api/events?institucion=INSTITUTION_ID&division=DIVISION_ID&page=1&limit=10
```

**Required Query Parameters:**
- `institucion`: Institution ID (required)

**Optional Query Parameters:**
- `division`: Division ID
- `page`: Page number for pagination
- `limit`: Number of events per page
- `search`: Search term for event title/description
- `estado`: Filter by event status

**Response:**
```json
{
  "success": true,
  "message": "Eventos obtenidos exitosamente",
  "data": {
    "events": [
      {
        "_id": "event_id",
        "titulo": "Event Title",
        "descripcion": "Event description",
        "fecha": "2024-12-25T00:00:00.000Z",
        "hora": "14:00",
        "lugar": "Event location",
        "estado": "activo",
        "creador": {
          "_id": "user_id",
          "name": "Creator Name",
          "email": "creator@example.com"
        },
        "institucion": {
          "_id": "institution_id",
          "nombre": "Institution Name",
          "razonSocial": "Institution Legal Name"
        },
        "division": {
          "_id": "division_id",
          "nombre": "Division Name"
        },
        "participantes": [
          {
            "_id": "user_id",
            "name": "Participant Name",
            "email": "participant@example.com"
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

### Create Event
```
POST /api/events
```

**Request Body:**
```json
{
  "titulo": "Event Title",
  "descripcion": "Event description",
  "fecha": "2024-12-25",
  "hora": "14:00",
  "lugar": "Event location",
  "institucion": "institution_id",
  "division": "division_id",
  "estado": "activo"
}
```

### Get Event by ID
```
GET /api/events/:id
```

### Update Event
```
PUT /api/events/:id
```

### Delete Event
```
DELETE /api/events/:id
```

### Add Participant
```
POST /api/events/:id/participants
```

**Request Body:**
```json
{
  "userId": "user_id"
}
```

### Remove Participant
```
DELETE /api/events/:id/participants/:userId
```

### Get Upcoming Events
```
GET /api/events/upcoming/:institutionId?limit=10
```

### Get Event Statistics
```
GET /api/events/stats/:institutionId
```

## Error Responses

### Missing Required Parameter
```json
{
  "success": false,
  "message": "El parámetro institucion es obligatorio"
}
```

### Institution Not Found
```json
{
  "success": false,
  "message": "La institución especificada no existe"
}
```

### Division Not Found
```json
{
  "success": false,
  "message": "La división especificada no existe"
}
```

## Testing

Run the test file to verify functionality:
```bash
node test-events-service.js
```

## Migration Notes

1. **Database Schema**: The Event model structure has changed. Existing events may need to be migrated.
2. **API Changes**: The `cuenta` parameter is now `institucion`, and `division` is a new optional parameter.
3. **Date Filtering**: All events are now automatically filtered to show only current and future events.
4. **Participant Management**: Participant status is simplified - participants are either enrolled or not enrolled.

## Example Usage

```javascript
// Get events for a specific institution
const response = await fetch('/api/events?institucion=123456789&page=1&limit=10', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});

// Get events for a specific institution and division
const response = await fetch('/api/events?institucion=123456789&division=987654321&page=1&limit=10', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});
```

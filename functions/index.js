const { onCall, HttpsError } = require("firebase-functions/v2/https");

exports.mejorarRedaccion = onCall(async (request) => {
    const textoOriginal = request.data.texto || "";
    const imagenDataUrl = request.data.imagen || ""; // Aquí llega la foto

    if (!textoOriginal) {
        throw new HttpsError('invalid-argument', 'El texto original está vacío.');
    }
    
    // Le decimos en el prompt que tome en cuenta la imagen
// Le damos permiso explícito de usar la foto para completar la idea
    const prompt = `Eres un ingeniero experto en mantenimiento. Tu tarea es redactar un reporte de incidencia técnico profesional uniendo las notas del técnico y la evidencia de la fotografía adjunta.

    Notas originales del técnico: "${textoOriginal}"

    INSTRUCCIONES:
    1. Analiza la fotografía detalladamente para identificar el área, los materiales, los equipos y el daño.
    2. Si las notas del técnico están incompletas (ej. "este lugar es..."), usa la información visual de la foto para completar la idea con precisión técnica.
    3. Mejora la redacción, corrige la ortografía y utiliza terminología profesional de mantenimiento.

    REGLA ESTRICTA: Devuelve ÚNICAMENTE el texto final mejorado. NO des opciones, NO agregues saludos, explicaciones ni formato markdown. Tu respuesta debe ser exclusivamente el párrafo del reporte:`;

    // Preparamos el array de "partes" que le enviaremos a Gemini
    const partes = [{ text: prompt }];

    // Si el frontend envió una imagen, la limpiamos y la agregamos a las partes
    if (imagenDataUrl) {
        // Expresión regular para separar el tipo de imagen del código Base64
        const matches = imagenDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (matches && matches.length === 3) {
            partes.push({
                inlineData: {
                    mimeType: matches[1],
                    data: matches[2]
                }
            });
        }
    }
    
    const apiKey = process.env.GEMINI_API_KEY; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    // Aquí mandamos el texto + la imagen al mismo tiempo
                    parts: partes 
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "Error desconocido en la API de Gemini");
        }

        const result = await response.json();
        const textoMejorado = result.candidates[0].content.parts[0].text;

        return { texto: textoMejorado };
        
    } catch (error) {
        console.error("Error catastrófico con la IA:", error);
        throw new HttpsError('internal', "Hubo un problema con la IA: " + error.message);
    }
});




const { google } = require("googleapis");

// 1. Cargamos las credenciales desde el archivo JSON protegido por .gitignore
const credenciales = require("./Google-Credencial.json");

// 2. Configuramos el cliente OAuth2 usando los datos del JSON
const oauth2Client = new google.auth.OAuth2(
  credenciales.client_id,
  credenciales.client_secret,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: credenciales.refresh_token
});

// Mantenemos el nombre 'auth' para que getProyectos, getReportesAntiguos y subirReporteDrive sigan funcionando sin cambios
const auth = oauth2Client;



// Le decimos explícitamente que acepte cualquier origen (o puedes poner tu localhost específico)
exports.getProyectos = onCall({ cors: true }, async (request) => {
    try {
        const sheets = google.sheets({ version: 'v4', auth });
        
        // El ID de tu hoja maestra que usabas en Apps Script
        const MASTER_SHEET_ID = '1r4Xl5yXN8SaSNnIJyDTjK0JmjVTnE394jxLjhiHf5YM';
        
        // Hacemos la petición a la API
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: MASTER_SHEET_ID,
            range: 'PROYECTOS!A2:M', // Leemos desde la fila 2
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) return { proyectos: [] };

        // Transformamos los datos al formato que necesita tu web
        const proyectos = rows.map(row => {
            if (row[0] && row[11] && row[12]) {
                return {
                    nombre: row[0],
                    id: row[11],       // Columna L
                    folderUrl: row[12] // Columna M
                };
            }
            return null;
        }).filter(Boolean);

        return { proyectos };

    } catch (error) {
        console.error("Error al leer Google Sheets:", error);
        throw new HttpsError('internal', 'No se pudieron cargar los proyectos desde Sheets.');
    }
});




// --- NUEVA FUNCIÓN: Obtener Reportes Antiguos de Drive ---
exports.getReportesAntiguos = onCall({ cors: true }, async (request) => {
    try {
        const folderUrl = request.data.folderUrl;
        if (!folderUrl) {
            throw new HttpsError('invalid-argument', 'No se proporcionó la URL de la carpeta del proyecto.');
        }

        // 1. Extraer el ID de la carpeta base a partir de la URL (Replicando tu Helper)
        let baseFolderId = folderUrl;
        const match = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            baseFolderId = match[1];
        }

        const drive = google.drive({ version: 'v3', auth }); // 'auth' ya lo tienes definido arriba en tu index.js

        // 2. Buscar la subcarpeta "02 - Reportes" dentro de la carpeta base
        const folderQuery = await drive.files.list({
            q: `'${baseFolderId}' in parents and name = '02 - Reportes' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)'
        });

        const subFolders = folderQuery.data.files;
        if (!subFolders || subFolders.length === 0) {
            // Si la carpeta no existe, simplemente devolvemos un arreglo vacío
            return { archivos: [] };
        }

        const reportesFolderId = subFolders[0].id;

        // 3. Buscar todos los archivos PDF dentro de la carpeta "02 - Reportes"
        const pdfQuery = await drive.files.list({
            q: `'${reportesFolderId}' in parents and mimeType = 'application/pdf' and trashed = false`,
            fields: 'files(id, name, webViewLink, createdTime)',
            orderBy: 'createdTime desc' // Ordenar del más nuevo al más viejo
        });

        const archivosPDF = pdfQuery.data.files || [];

        // 4. Devolvemos los archivos listos para el frontend
        return { archivos: archivosPDF };

    } catch (error) {
        console.error("Error al leer Drive API:", error);
        throw new HttpsError('internal', 'Error al obtener los reportes antiguos: ' + error.message);
    }
});



// Asegúrate de agregar esta línea de 'stream' hasta arriba de tu index.js, junto a tus otros requires:
const { Readable } = require('stream');

// --- NUEVA FUNCIÓN: Subir PDF a Google Drive ---
exports.subirReporteDrive = onCall({ cors: true, timeoutSeconds: 120 }, async (request) => {
    try {
        const { folderUrl, pdfBase64, nombreArchivo } = request.data;
        
        if (!folderUrl || !pdfBase64) {
            throw new HttpsError('invalid-argument', 'Faltan datos para subir el archivo.');
        }

        const drive = google.drive({ version: 'v3', auth });

        // 1. Extraer ID de la carpeta principal
        let baseFolderId = folderUrl;
        const match = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) baseFolderId = match[1];

        // 2. Buscar o crear la subcarpeta "02 - Reportes"
        const folderQuery = await drive.files.list({
            q: `'${baseFolderId}' in parents and name = '02 - Reportes' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)'
        });

        let reportesFolderId;
        if (folderQuery.data.files && folderQuery.data.files.length > 0) {
            reportesFolderId = folderQuery.data.files[0].id;
        } else {
            // Si no existe, la creamos
            const newFolder = await drive.files.create({
                resource: { 
                    name: '02 - Reportes', 
                    mimeType: 'application/vnd.google-apps.folder', 
                    parents: [baseFolderId] 
                },
                fields: 'id'
            });
            reportesFolderId = newFolder.data.id;
        }

        // 3. Convertir el Base64 a un Stream de archivo para Drive
        const buffer = Buffer.from(pdfBase64, 'base64');
        const stream = Readable.from(buffer);

        // 4. Subir el archivo PDF a la carpeta
        const pdfFile = await drive.files.create({
            resource: {
                name: nombreArchivo || 'Reporte_Mantenimiento.pdf',
                parents: [reportesFolderId]
            },
            media: {
                mimeType: 'application/pdf',
                body: stream
            },
            fields: 'id, webViewLink'
        });

        // 5. Opcional: Dar permisos de lectura para que cualquiera con el link pueda verlo
        // (Igual que hacias en Apps Script con: DriveApp.Access.ANYONE_WITH_LINK)
        await drive.permissions.create({
            fileId: pdfFile.data.id,
            requestBody: { role: 'reader', type: 'anyone' }
        });

        return { url: pdfFile.data.webViewLink };

    } catch (error) {
        console.error("Error al subir a Drive:", error);
        throw new HttpsError('internal', 'No se pudo guardar el reporte en Drive: ' + error.message);
    }
});
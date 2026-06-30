// ============================================================================
// 1. IMPORTACIONES Y CONFIGURACIÓN INICIAL
// ============================================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore"); 
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const { Readable } = require('stream');

// Inicializamos Firebase Admin
admin.initializeApp();

// Cargamos credenciales de Google
const credenciales = require("./Google-Credencial.json");

// Configuramos el cliente OAuth2
const oauth2Client = new google.auth.OAuth2(
  credenciales.client_id,
  credenciales.client_secret,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: credenciales.refresh_token
});

const auth = oauth2Client;

// Correo donde Mantonet recibirá las alertas
const correoAdmin = "mantonet.contacto@gmail.com"; 

// ============================================================================
// 2. CONFIGURACIÓN DE CORREO (FUNCIÓN PROTEGIDA)
// ============================================================================
// Se ejecuta solo cuando es necesario para evitar colapsos en el arranque del servidor
const obtenerTransporter = () => {
    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.GMAIL_EMAIL,
            pass: process.env.GMAIL_PASSWORD
        }
    });
};

// ============================================================================
// 3. FUNCIONES HTTP (onCall) - IA, Sheets y Drive
// ============================================================================

exports.mejorarRedaccion = onCall(async (request) => {
    const textoOriginal = request.data.texto || "";
    const imagenDataUrl = request.data.imagen || ""; 

    if (!textoOriginal) {
        throw new HttpsError('invalid-argument', 'El texto original está vacío.');
    }
    
    const prompt = `Eres un ingeniero experto en mantenimiento. Tu tarea es redactar un reporte de incidencia técnico profesional uniendo las notas del técnico y la evidencia de la fotografía adjunta.

    Notas originales del técnico: "${textoOriginal}"

    INSTRUCCIONES:
    1. Analiza la fotografía detalladamente para identificar el área, los materiales, los equipos y el daño.
    2. Si las notas del técnico están incompletas (ej. "este lugar es..."), usa la información visual de la foto para completar la idea con precisión técnica.
    3. Mejora la redacción, corrige la ortografía y utiliza terminología profesional de mantenimiento.

    REGLA ESTRICTA: Devuelve ÚNICAMENTE el texto final mejorado. NO des opciones, NO agregues saludos, explicaciones ni formato markdown. Tu respuesta debe ser exclusivamente el párrafo del reporte:`;

    const partes = [{ text: prompt }];

    if (imagenDataUrl) {
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: partes }] })
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

exports.getProyectos = onCall({ cors: true }, async (request) => {
    try {
        const sheets = google.sheets({ version: 'v4', auth });
        const MASTER_SHEET_ID = '1r4Xl5yXN8SaSNnIJyDTjK0JmjVTnE394jxLjhiHf5YM';
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: MASTER_SHEET_ID,
            range: 'PROYECTOS!A2:M', 
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) return { proyectos: [] };

        const proyectos = rows.map(row => {
            if (row[0] && row[11] && row[12]) {
                return { nombre: row[0], id: row[11], folderUrl: row[12] };
            }
            return null;
        }).filter(Boolean);

        return { proyectos };

    } catch (error) {
        console.error("Error al leer Google Sheets:", error);
        throw new HttpsError('internal', 'No se pudieron cargar los proyectos desde Sheets.');
    }
});

exports.getReportesAntiguos = onCall({ cors: true }, async (request) => {
    try {
        const folderUrl = request.data.folderUrl;
        if (!folderUrl) throw new HttpsError('invalid-argument', 'No se proporcionó la URL.');

        let baseFolderId = folderUrl;
        const match = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) baseFolderId = match[1];

        const drive = google.drive({ version: 'v3', auth });

        const folderQuery = await drive.files.list({
            q: `'${baseFolderId}' in parents and name = '02 - Reportes' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)'
        });

        const subFolders = folderQuery.data.files;
        if (!subFolders || subFolders.length === 0) return { archivos: [] };

        const reportesFolderId = subFolders[0].id;

        const pdfQuery = await drive.files.list({
            q: `'${reportesFolderId}' in parents and mimeType = 'application/pdf' and trashed = false`,
            fields: 'files(id, name, webViewLink, createdTime)',
            orderBy: 'createdTime desc'
        });

        return { archivos: pdfQuery.data.files || [] };

    } catch (error) {
        console.error("Error al leer Drive API:", error);
        throw new HttpsError('internal', 'Error al obtener los reportes antiguos: ' + error.message);
    }
});

exports.subirReporteDrive = onCall({ cors: true, timeoutSeconds: 120 }, async (request) => {
    try {
        const { folderUrl, pdfBase64, nombreArchivo } = request.data;
        if (!folderUrl || !pdfBase64) throw new HttpsError('invalid-argument', 'Faltan datos.');

        const drive = google.drive({ version: 'v3', auth });

        let baseFolderId = folderUrl;
        const match = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) baseFolderId = match[1];

        const folderQuery = await drive.files.list({
            q: `'${baseFolderId}' in parents and name = '02 - Reportes' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id)'
        });

        let reportesFolderId;
        if (folderQuery.data.files && folderQuery.data.files.length > 0) {
            reportesFolderId = folderQuery.data.files[0].id;
        } else {
            const newFolder = await drive.files.create({
                resource: { name: '02 - Reportes', mimeType: 'application/vnd.google-apps.folder', parents: [baseFolderId] },
                fields: 'id'
            });
            reportesFolderId = newFolder.data.id;
        }

        const buffer = Buffer.from(pdfBase64, 'base64');
        const stream = Readable.from(buffer);

        const pdfFile = await drive.files.create({
            resource: { name: nombreArchivo || 'Reporte_Mantenimiento.pdf', parents: [reportesFolderId] },
            media: { mimeType: 'application/pdf', body: stream },
            fields: 'id, webViewLink'
        });

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

// ============================================================================
// 4. TRIGGERS DE FIRESTORE (Notificaciones Automáticas) v2
// ============================================================================

exports.notificarNuevoRegistro = onDocumentCreated("proveedores/{proveedorId}", async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const nombreCompleto = `${data.nombre || ""} ${data.apellidos || ""}`.trim();
    const especialidades = data.especialidades ? data.especialidades.join(", ") : "Ninguna especificada";

    const mailOptions = {
        from: "Mantonet Notificaciones <noreply@mantonet.com>",
        to: correoAdmin,
        subject: `Nuevo registro básico de técnico: ${nombreCompleto}`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h3 style="color: #d32f2f;">Mantonet: Nuevo técnico registrado</h3>
                <p><strong>Nombre:</strong> ${nombreCompleto}</p>
                <p><strong>Teléfono:</strong> ${data.telefono}</p>
                <p><strong>Correo:</strong> ${data.correo}</p>
                <p><strong>Especialidades:</strong> ${especialidades}</p>
                <p><strong>Estatus actual:</strong> ${data.estatus}</p>
                <hr>
                <p>Este usuario aún debe completar su expediente (Paso 2). Si demora, puedes enviarle un recordatorio por WhatsApp desde el dashboard administrativo.</p>
            </div>
        `
    };

    try {
        const transporter = obtenerTransporter();
        await transporter.sendMail(mailOptions);
        return console.log(`Notificación enviada para: ${nombreCompleto}`);
    } catch (error) {
        return console.error("Error al enviar correo de nuevo registro:", error);
    }
});

exports.notificarRevisionFinal = onDocumentUpdated("proveedores/{proveedorId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const dataAntes = snapshot.before.data();
    const dataDespues = snapshot.after.data();

    // Verificamos que el estatus haya cambiado a "revision_final"
    if (dataAntes.estatus !== "revision_final" && dataDespues.estatus === "revision_final") {
        const nombreCompleto = `${dataDespues.nombre || ""} ${dataDespues.apellidos || ""}`.trim();

        const mailOptions = {
            from: "Mantonet Notificaciones <noreply@mantonet.com>",
            to: correoAdmin,
            subject: `Expediente completado para revisión: ${nombreCompleto}`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h3 style="color: #2196F3;">Mantonet: Expediente listo para revisión</h3>
                    <p>El técnico <strong>${nombreCompleto}</strong> ha subido todos sus documentos y su perfil está listo para validación.</p>
                    <p><strong>Años de experiencia:</strong> ${dataDespues.experiencia || "N/A"}</p>
                    <p><strong>Garantía ofrecida:</strong> ${dataDespues.garantia || "N/A"}</p>
                    <hr>
                    <p>Por favor, ingresa al panel administrativo para visualizar el INE, fotos de trabajo y certificaciones, y procede a Aprobar o Rechazar la solicitud.</p>
                </div>
            `
        };

        try {
            const transporter = obtenerTransporter();
            await transporter.sendMail(mailOptions);
            return console.log(`Notificación enviada para: ${nombreCompleto}`);
        } catch (error) {
            return console.error("Error al enviar correo de revisión final:", error);
        }
    }
    
    return null;
});
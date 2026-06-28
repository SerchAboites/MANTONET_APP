// 1. Importaciones de Firebase v12
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, where, updateDoc, doc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


// 2. Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCxFbPYP6fdmgacKzee6hr6omFxgqzO4iE",
    authDomain: "mantonet-reportes.firebaseapp.com",
    projectId: "mantonet-reportes",
    storageBucket: "mantonet-reportes.firebasestorage.app",
    messagingSenderId: "932956793036",
    appId: "1:932956793036:web:7120624efae9cdc362fa69",
    measurementId: "G-C4VETFSGPC"
};

// 3. Inicializar Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const storage = getStorage(app);

const firebaseFunctions = getFunctions(app);
// AHORA SÍ, la ponemos aquí abajo:
const getReportesAntiguos = httpsCallable(firebaseFunctions, 'getReportesAntiguos');
const subirReporteDrive = httpsCallable(firebaseFunctions, 'subirReporteDrive');

console.log("🔥 Firebase inicializado correctamente en MantoReportes.js");

document.addEventListener('DOMContentLoaded', () => {

    // --- Referencias al DOM ---
    const form = document.getElementById('incidencia-form');
    const loaderOverlay = document.getElementById('loader-overlay');
    const openCameraButton = document.getElementById('open-camera-btn');
    const capturePhotoButton = document.getElementById('capture-photo-btn');
    const cameraStream = document.getElementById('camera-stream');
    const cameraPreview = document.getElementById('camera-preview');
    const cameraPlaceholder = document.getElementById('camera-placeholder');
    const hiddenImageInput = document.getElementById('imagenIncidencia');
    const cameraSelect = document.getElementById('camera-select');
    const retakePhotoButton = document.getElementById('retake-photo-btn');
    const selectGalleryButton = document.getElementById('select-gallery-btn');
    const galleryInput = document.getElementById('gallery-input');
    const generateReportButton = document.getElementById('generate-report-btn');
    const aiImproveBtn = document.getElementById('ai-improve-btn');



    // --- Variables de Estado (El Cerebro del Gestor) ---
    let incidenciasDelProyecto = [];
    let indiceActual = -1; // -1 significa que estamos creando una nueva
    let idIncidenciaEditando = null;

    // --- Nuevas Referencias al DOM ---
    const navIncidencias = document.getElementById('nav-incidencias');
    const navFecha = document.getElementById('nav-fecha');
    const navContador = document.getElementById('nav-contador');

    const contenedorBtnNueva = document.getElementById('contenedor-btn-nueva');

    const submitBtn = document.getElementById('submit-form-btn'); // Asegúrate de que tu botón de submit tenga este ID




    const context = cameraPreview.getContext('2d');
    let currentStream = null;
    let animationFrameId = null;

    // --- Helpers de UI ---
    const showLoader = (message = 'Procesando...') => {
        const loaderMessage = loaderOverlay.querySelector('p');
        if (loaderMessage) loaderMessage.textContent = message;
        loaderOverlay.classList.remove('hidden');
    };
    const hideLoader = () => loaderOverlay.classList.add('hidden');

    const setDefaultDateTime = () => {
        const fechaInput = document.getElementById('fecha');
        if (!fechaInput) return;
        const now = new Date();
        const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        fechaInput.value = formattedDate;
    };

    // --- HELPER PARA CONVERTIR URL A BASE64 ---
    const getBase64ImageFromUrl = async (imageUrl) => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Error convirtiendo imagen a Base64:", e);
            return null;
        }
    };

    // --- Lógica de Proyectos Ficticia ---
    // --- Lógica Real de Proyectos (Google Sheets) ---
    const cargarProyectos = async () => {
        const proyectoSelect = document.getElementById('proyecto-select');
        proyectoSelect.innerHTML = '<option value="" disabled selected>Cargando proyectos desde Google Sheets...</option>';

        try {
            // Usamos 'firebaseFunctions' y 'httpsCallable' que ya importaste en la línea 5 y 22
            const obtenerProyectos = httpsCallable(firebaseFunctions, 'getProyectos');
            const resultado = await obtenerProyectos();

            const listaProyectos = resultado.data.proyectos;

            // Limpiamos el select para inyectar los reales
            proyectoSelect.innerHTML = '<option value="" disabled selected>Selecciona un proyecto...</option>';

            if (listaProyectos && listaProyectos.length > 0) {
                listaProyectos.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.id; // El ID de la columna L
                    option.textContent = p.nombre; // El nombre de la columna A

                    // Opcional: Guardamos la URL del folder en un data-attribute por si la ocupas después
                    option.dataset.folderUrl = p.folderUrl;

                    proyectoSelect.appendChild(option);
                });
            } else {
                proyectoSelect.innerHTML = '<option value="" disabled selected>No se encontraron proyectos válidos.</option>';
            }

        } catch (error) {
            console.error("Error al traer los proyectos de Sheets:", error);
            proyectoSelect.innerHTML = '<option value="" disabled selected>Error al cargar proyectos.</option>';
        }
    };


    // --- LÓGICA PARA CARGAR PDFs ANTIGUOS AL CAMBIAR DE PROYECTO ---
    const proyectoSelect = document.getElementById('proyecto-select');
    const listaReportes = document.getElementById('lista-reportes-antiguos');


    // --- LÓGICA PARA CARGAR PDFs ANTIGUOS Y DATOS AL CAMBIAR DE PROYECTO ---
    proyectoSelect.addEventListener('change', async (event) => {
        // Extraemos el valor del ID del proyecto y disparamos la carga de Firebase
        const proyectoIdSeleccionado = event.target.value;
        cargarIncidenciasDesdeFirebase(proyectoIdSeleccionado);

        // Obtenemos la opción seleccionada
        const opcionSeleccionada = event.target.options[event.target.selectedIndex];

        // Extraemos el folderUrl que guardamos en el data-attribute (dataset)
        const folderUrl = opcionSeleccionada.dataset.folderUrl;

        if (!folderUrl) {
            listaReportes.innerHTML = '<li style="color: red;">Este proyecto no tiene carpeta configurada.</li>';
            return;
        }

        // Mostramos un mensaje de carga
        listaReportes.innerHTML = '<li><span class="loader-text">⏳ Buscando reportes en Google Drive...</span></li>';

        try {
            // Llamamos al backend
            const resultado = await getReportesAntiguos({ folderUrl: folderUrl });
            const archivos = resultado.data.archivos;

            // Limpiamos la lista
            listaReportes.innerHTML = '';

            if (archivos.length === 0) {
                listaReportes.innerHTML = '<li style="color: #888;">No hay reportes previos para este proyecto.</li>';
                return;
            }

            // Pintamos los botones/enlaces para cada PDF
            archivos.forEach(archivo => {
                const li = document.createElement('li');
                li.style.marginBottom = '10px';

                const fecha = new Date(archivo.createdTime).toLocaleDateString('es-MX', {
                    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });

                li.innerHTML = `
                    <a href="${archivo.webViewLink}" target="_blank" class="btn" style="display: block; background-color: #333; color: white; text-align: left; text-decoration: none;">
                        📄 ${archivo.name} <br>
                        <small style="color: #bbb; font-size: 12px;">🗓️ ${fecha}</small>
                    </a>
                `;
                listaReportes.appendChild(li);
            });

        } catch (error) {
            console.error("Error al cargar reportes:", error);
            listaReportes.innerHTML = '<li style="color: red;">Error al conectar con Drive. Revisa la consola.</li>';
        }
    });





    // --- Lógica de la Cámara ---
    const stopCurrentStream = () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    };

    const startStream = async (constraints) => {
        stopCurrentStream();
        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraStream.srcObject = currentStream;

            cameraStream.onloadedmetadata = () => {
                const containerWidth = cameraPreview.parentElement.offsetWidth;
                const dpr = window.devicePixelRatio || 1;
                cameraPreview.width = containerWidth * dpr;
                cameraPreview.height = containerWidth * dpr;
                cameraPreview.style.width = `${containerWidth}px`;
                cameraPreview.style.height = `${containerWidth}px`;
                context.scale(dpr, dpr);

                cameraPreview.classList.remove('hidden');
                cameraPlaceholder.classList.add('hidden');
                startDrawingLoop(containerWidth);
                openCameraButton.classList.add('hidden');
                capturePhotoButton.classList.remove('hidden');
                selectGalleryButton.classList.add('hidden');
                retakePhotoButton.classList.add('hidden');
            };
        } catch (error) {
            alert(`Error al iniciar la cámara. Verifica permisos.`);
            resetCameraUI();
        }
    };

    const openCamera = async () => {
        const constraints_hd_rear = { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] } };
        try {
            await startStream(constraints_hd_rear);
        } catch (err) {
            await startStream({ video: true });
        }
    };

    const resetCameraUI = () => {
        stopCurrentStream();
        context.clearRect(0, 0, cameraPreview.width, cameraPreview.height);
        cameraPreview.classList.add('hidden');
        cameraPlaceholder.classList.remove('hidden');
        capturePhotoButton.classList.add('hidden');
        openCameraButton.classList.remove('hidden');
        selectGalleryButton.classList.remove('hidden');
        hiddenImageInput.value = '';
        retakePhotoButton.classList.add('hidden');
    };

    const startDrawingLoop = (containerWidth) => {
        const draw = () => {
            if (!currentStream) return;
            const size = Math.min(cameraStream.videoWidth, cameraStream.videoHeight);
            const x = (cameraStream.videoWidth - size) / 2;
            const y = (cameraStream.videoHeight - size) / 2;
            context.clearRect(0, 0, containerWidth, containerWidth);
            context.drawImage(cameraStream, x, y, size, size, 0, 0, containerWidth, containerWidth);
            animationFrameId = requestAnimationFrame(draw);
        };
        draw();
    };

    const capturePhoto = () => {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        const size = Math.min(cameraStream.videoWidth, cameraStream.videoHeight);
        const x = (cameraStream.videoWidth - size) / 2;
        const y = (cameraStream.videoHeight - size) / 2;
        context.setTransform(1, 0, 0, 1, 0, 0);
        cameraPreview.width = size;
        cameraPreview.height = size;
        context.drawImage(cameraStream, x, y, size, size, 0, 0, size, size);

        hiddenImageInput.value = cameraPreview.toDataURL('image/jpeg', 0.8);
        stopCurrentStream();

        capturePhotoButton.classList.add('hidden');
        retakePhotoButton.classList.remove('hidden');
    };

    const handleGalleryFile = (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                stopCurrentStream();
                const size = Math.min(img.width, img.height);
                const x = (img.width - size) / 2;
                const y = (img.height - size) / 2;
                context.setTransform(1, 0, 0, 1, 0, 0);
                cameraPreview.width = size;
                cameraPreview.height = size;
                context.drawImage(img, x, y, size, size, 0, 0, size, size);
                hiddenImageInput.value = cameraPreview.toDataURL('image/jpeg', 0.8);
                cameraPreview.classList.remove('hidden');
                cameraPlaceholder.classList.add('hidden');
                openCameraButton.classList.add('hidden');
                selectGalleryButton.classList.add('hidden');
                retakePhotoButton.classList.remove('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    const dataURLtoBlob = (dataurl) => {
        let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while (n--) { u8arr[n] = bstr.charCodeAt(n); }
        return new Blob([u8arr], { type: mime });
    }


// --- LÓGICA DE NAVEGACIÓN Y EDICIÓN ---
    const cargarIncidenciasDesdeFirebase = async (proyectoId) => {
        try {
            const incidenciasRef = collection(db, "incidencias");
            const q = query(incidenciasRef, where("proyectoId", "==", proyectoId));
            const querySnapshot = await getDocs(q);

            incidenciasDelProyecto = [];
            querySnapshot.forEach((doc) => {
                incidenciasDelProyecto.push({ id: doc.id, ...doc.data() });
            });

            // Ordenamos para que las más recientes salgan primero
            incidenciasDelProyecto.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

            // --- CORRECCIÓN DE LÓGICA AQUÍ ---
            // 1. Siempre preparamos el formulario en blanco al cambiar de proyecto para evitar que se ponga en modo edición solo.
            prepararFormularioNuevo();
            
            // 2. Actualizamos la cuadrícula del historial "en el fondo" por si el usuario decide ir a esa pestaña.
            renderizarHistorialMiniaturas();

        } catch (error) {
            console.error("Error al cargar incidencias de Firebase:", error);
        }
    };



    
    // --- CONTROL DE ESTADO DE FORMULARIO ---
    const mostrarIncidenciaEnFormulario = (index) => {
        if (index < 0 || index >= incidenciasDelProyecto.length) return;

        const inc = incidenciasDelProyecto[index];
        indiceActual = index;
        idIncidenciaEditando = inc.id;

        // Rellenar los campos
        document.getElementById('fecha').value = inc.fecha || '';
        document.getElementById('area').value = inc.area || '';
        document.getElementById('elementoInspeccionado').value = inc.elemento || '';
        document.getElementById('especialidad').value = inc.especialidad || '';
        document.getElementById('descripcion').value = inc.descripcion || '';
        document.getElementById('diagnostico').value = inc.diagnostico || '';

        // Limpiar el input de imagen oculto para que no intente subir datos viejos por accidente
        hiddenImageInput.value = '';

        // Cambiar la UI a Modo Edición
        const bannerEdicion = document.getElementById('banner-edicion');
        if (bannerEdicion) bannerEdicion.classList.remove('hidden');

        submitBtn.textContent = "💾 Actualizar Registro";
        submitBtn.style.backgroundColor = "#eab308"; // Amarillo advertencia

        // Mostrar la foto anterior en el recuadro
        const cameraPlaceholder = document.getElementById('camera-placeholder');
        if (inc.fotoUrl) {
            cameraPlaceholder.innerHTML = `<img src="${inc.fotoUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
            cameraPlaceholder.classList.remove('hidden');
            cameraPreview.classList.add('hidden'); // Apagar canvas
        }
    };

    window.prepararFormularioNuevo = () => {
        indiceActual = -1;
        idIncidenciaEditando = null;
        form.reset();
        setDefaultDateTime();
        resetCameraUI();

        // Cambiar la UI a Modo Creación
        const bannerEdicion = document.getElementById('banner-edicion');
        if (bannerEdicion) bannerEdicion.classList.add('hidden');

        submitBtn.textContent = "Registrar Incidencia (Rápido)";
        submitBtn.style.backgroundColor = "#2563eb"; // Azul original
        document.getElementById('camera-placeholder').innerHTML = "La cámara está apagada";
    };










    const handleFormSubmit = async (event) => {
        event.preventDefault();

        // Validación: Solo exigir imagen si es un registro NUEVO
        if (!idIncidenciaEditando && !hiddenImageInput.value) {
            alert('Por favor, captura una foto de evidencia.');
            return;
        }

        const proyectoSelect = document.getElementById('proyecto-select');
        const proyectoId = proyectoSelect.value;
        const proyectoNombre = proyectoSelect.options[proyectoSelect.selectedIndex].text;

        if (!proyectoId) {
            alert('Selecciona un proyecto.');
            return;
        }

        const formData = Object.fromEntries(new FormData(form));

        try {
            if (idIncidenciaEditando) {
                // --- MODO ACTUALIZACIÓN ---
                showLoader('Actualizando incidencia en la nube...');
                const docRef = doc(db, "incidencias", idIncidenciaEditando);

                const datosActualizados = {
                    proyectoNombre: proyectoNombre,
                    fecha: formData.fecha,
                    area: formData.area,
                    elemento: formData.elementoInspeccionado,
                    especialidad: formData.especialidad,
                    descripcion: formData.descripcion,
                    diagnostico: formData.diagnostico
                };

                // Solo subir imagen si hay un Base64 nuevo (es decir, el usuario tomó una foto nueva)
                if (hiddenImageInput.value && hiddenImageInput.value.startsWith('data:image')) {
                    const imageBlob = dataURLtoBlob(hiddenImageInput.value);
                    const fileName = `incidencias/${proyectoId}_${Date.now()}.jpg`;
                    const storageRef = ref(storage, fileName);
                    await uploadBytes(storageRef, imageBlob);
                    datosActualizados.fotoUrl = await getDownloadURL(storageRef);
                }

                await updateDoc(docRef, datosActualizados);
                alert(`¡Registro actualizado con éxito!`);

                // Refrescamos la memoria local con los datos nuevos
                incidenciasDelProyecto[indiceActual] = { ...incidenciasDelProyecto[indiceActual], ...datosActualizados };

                // Limpiamos el formulario y regresamos a la vista de historial
                prepararFormularioNuevo();
                renderizarHistorialMiniaturas();
                cambiarTab('historial');

            } else {
                // --- MODO CREACIÓN (Registro Nuevo) ---
                showLoader('Subiendo foto y guardando registro nuevo...');

                const imageBlob = dataURLtoBlob(hiddenImageInput.value);
                const fileName = `incidencias/${proyectoId}_${Date.now()}.jpg`;
                const storageRef = ref(storage, fileName);
                await uploadBytes(storageRef, imageBlob);
                const downloadURL = await getDownloadURL(storageRef);

                const nuevoRegistro = {
                    proyectoId: proyectoId,
                    proyectoNombre: proyectoNombre,
                    fecha: formData.fecha,
                    area: formData.area,
                    elemento: formData.elementoInspeccionado,
                    especialidad: formData.especialidad,
                    descripcion: formData.descripcion,
                    diagnostico: formData.diagnostico,
                    fotoUrl: downloadURL,
                    timestamp: serverTimestamp()
                };

                await addDoc(collection(db, "incidencias"), nuevoRegistro);
                alert(`¡Incidencia registrada al instante!`);

                // Recargamos todo para meterlo a la memoria y preparamos el formulario en blanco
                await cargarIncidenciasDesdeFirebase(proyectoId);
                prepararFormularioNuevo();
            }

        } catch (error) {
            console.error("Error al procesar en Firebase:", error);
            alert(`Hubo un error: ${error.message}`);
        } finally {
            hideLoader();
        }
    };

    // --- GENERACIÓN DE PDF ESTILO "SLIDES" (Dark Mode) ÚNICA VERSIÓN ---
    const handleGenerateReport = async () => {
        const proyectoId = document.getElementById('proyecto-select').value;
        if (!proyectoId) {
            alert('Selecciona un proyecto para generar el reporte.'); return;
        }

        showLoader('Descargando fotos y armando PDF...');

        try {

            // ... en tu función handleGenerateReport:
            const incidenciasRef = collection(db, "incidencias");
            // Filtramos directamente en el servidor:
            const q = query(incidenciasRef, where("proyectoId", "==", proyectoId));
            const querySnapshot = await getDocs(q);

            const incidencias = [];
            querySnapshot.forEach((doc) => {
                incidencias.push(doc.data());
            });

            if (incidencias.length === 0) {
                alert("No hay incidencias para este proyecto.");
                hideLoader();
                return;
            }

            const paginas = [];

            for (let i = 0; i < incidencias.length; i++) {
                const inc = incidencias[i];
                let fotoBase64 = null;

                if (inc.fotoUrl) {
                    fotoBase64 = await getBase64ImageFromUrl(inc.fotoUrl);
                }

                const pagina = {
                    columns: [
                        {
                            width: '45%',
                            stack: [
                                {
                                    columns: [
                                        {
                                            text: 'MANTONET\n',
                                            fontSize: 22,
                                            bold: true,
                                            color: '#ffffff'
                                        },
                                        {
                                            table: {
                                                widths: ['*'],
                                                body: [[{ text: `${inc.fecha || ''}\n${inc.area || ''}`, fillColor: '#3a3a3a', color: '#ffffff', alignment: 'right', border: [false, false, false, false], margin: [8, 8, 8, 8] }]]
                                            },
                                            layout: 'noBorders'
                                        }
                                    ],
                                    margin: [0, 0, 0, 15]
                                },
                                { text: 'MANTENIMIENTO GENERAL', fontSize: 10, color: '#aaaaaa', margin: [0, -15, 0, 20] },
                                {
                                    table: {
                                        widths: ['*'],
                                        body: [[{
                                            text: `Elemento Inspeccionado: ${inc.elemento || ''}\nEspecialidad del Servicio: ${inc.especialidad || ''}\nDiagnóstico: ${inc.diagnostico || ''}`,
                                            fillColor: '#3a3a3a',
                                            color: '#ffffff',
                                            lineHeight: 1.5,
                                            border: [false, false, false, false],
                                            margin: [10, 10, 10, 10]
                                        }]]
                                    },
                                    layout: 'noBorders',
                                    margin: [0, 0, 0, 15]
                                },
                                {
                                    table: {
                                        widths: ['*'],
                                        body: [[{
                                            text: [
                                                { text: 'Descripción:\n', bold: true, fontSize: 14 },
                                                { text: inc.descripcion || '' }
                                            ],
                                            fillColor: '#3a3a3a',
                                            color: '#ffffff',
                                            border: [false, false, false, false],
                                            margin: [10, 10, 10, 150]
                                        }]]
                                    },
                                    layout: 'noBorders'
                                }
                            ]
                        },
                        {
                            width: '55%',
                            margin: [20, 0, 0, 0],
                            stack: [
                                fotoBase64 ? {
                                    image: fotoBase64,
                                    width: 400,
                                    height: 500,
                                    fit: [400, 500],
                                    alignment: 'center'
                                } : {
                                    table: {
                                        widths: ['*'],
                                        heights: [500],
                                        body: [[{ text: 'Sin imagen de evidencia', fillColor: '#3a3a3a', color: '#888888', alignment: 'center', margin: [0, 240, 0, 0], border: [false, false, false, false] }]]
                                    },
                                    layout: 'noBorders'
                                }
                            ]
                        }
                    ],
                    pageBreak: i < incidencias.length - 1 ? 'after' : undefined
                };

                paginas.push(pagina);
            }

            const docDefinition = {
                pageSize: 'A4',
                pageOrientation: 'landscape',
                pageMargins: [30, 30, 30, 30],
                background: function (currentPage, pageSize) {
                    return {
                        canvas: [
                            { type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#222222' }
                        ]
                    };
                },
                content: paginas
            };

            // --- CÓDIGO NUEVO PARA SUBIR A DRIVE ---
            const nombreDelArchivo = `Reporte_${proyectoId}_${Date.now()}.pdf`;
            const pdfDocGenerator = pdfMake.createPdf(docDefinition);

            showLoader('Generando PDF y subiendo a Google Drive...');

            // Obtenemos el Base64 en lugar de descargarlo directamente
            pdfDocGenerator.getBase64(async (dataBase64) => {
                try {
                    // Extraemos la URL de la carpeta del select
                    const proyectoSelect = document.getElementById('proyecto-select');
                    const folderUrl = proyectoSelect.options[proyectoSelect.selectedIndex].dataset.folderUrl;

                    // Llamamos a la Cloud Function
                    const resultado = await subirReporteDrive({
                        folderUrl: folderUrl,
                        pdfBase64: dataBase64,
                        nombreArchivo: nombreDelArchivo
                    });

                    alert("¡Reporte guardado con éxito en la carpeta del cliente!");

                    // Opcional: Abrir el PDF en una pestaña nueva para que lo vea
                    window.open(resultado.data.url, '_blank');

                } catch (error) {
                    console.error("Error al subir reporte:", error);
                    alert("Se generó el PDF, pero hubo un error al subirlo a Drive.");
                    // Fallback: si falla la subida, se lo descargamos localmente al usuario
                    pdfDocGenerator.download(nombreDelArchivo);
                } finally {
                    hideLoader();
                }
            });
            // --- FIN CÓDIGO NUEVO ---

        } catch (error) {
            console.error("Error generando PDF:", error);
            alert("Error al generar el PDF. Revisa la consola para más detalles.");
        } finally {
            hideLoader();
        }
    };

    // --- BOTÓN INTELIGENCIA ARTIFICIAL (La Magia) ---
    aiImproveBtn.addEventListener('click', async () => {
        const descInput = document.getElementById('descripcion');
        if (!descInput.value) {
            alert("Escribe algo en la descripción primero para que la IA lo mejore.");
            return;
        }

        const textoOriginal = descInput.value;
        descInput.value = "✨ La IA está analizando y redactando tu reporte... (toma un par de segundos)";
        aiImproveBtn.disabled = true; // Apagamos el botón para que no le piquen dos veces

        try {
            // Obtenemos la imagen en Base64 que dejó la cámara
            const imagenCapturada = document.getElementById('imagenIncidencia').value;

            const llamarGemini = httpsCallable(firebaseFunctions, 'mejorarRedaccion');

            // Le mandamos a la IA tanto el texto como la foto
            const resultado = await llamarGemini({
                texto: textoOriginal,
                imagen: imagenCapturada
            });

            descInput.value = resultado.data.texto;

        } catch (error) {
            console.error("Error en la IA:", error);
            alert("No se pudo conectar con la IA. Se restaurará tu texto original.");
            descInput.value = textoOriginal;
        } finally {
            aiImproveBtn.disabled = false; // Prendemos el botón de nuevo
        }
    });





    // --- Asignar Eventos ---
    setDefaultDateTime();
    cargarProyectos();
    form.addEventListener('submit', handleFormSubmit);
    generateReportButton.addEventListener('click', handleGenerateReport);
    openCameraButton.addEventListener('click', openCamera);
    capturePhotoButton.addEventListener('click', capturePhoto);
    retakePhotoButton.addEventListener('click', resetCameraUI);

    selectGalleryButton.addEventListener('click', () => galleryInput.click());
    galleryInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) handleGalleryFile(e.target.files[0]);
    });


    // --- NUEVO SISTEMA DE PESTAÑAS Y MINIATURAS ---
    window.cambiarTab = (tab) => {
        const formVista = document.getElementById('incidencia-form');
        const historialVista = document.getElementById('vista-historial');
        const btnTabNuevo = document.getElementById('tab-nuevo');
        const btnTabHistorial = document.getElementById('tab-historial');

        if (tab === 'nuevo') {
            formVista.classList.remove('hidden');
            historialVista.classList.add('hidden');
            btnTabNuevo.classList.add('active');
            btnTabHistorial.classList.remove('active');
        } else {
            formVista.classList.add('hidden');
            historialVista.classList.remove('hidden');
            btnTabNuevo.classList.remove('active');
            btnTabHistorial.classList.add('active');
            renderizarHistorialMiniaturas();
        }
    };

    window.cancelarEdicion = () => {
        prepararFormularioNuevo();
        cambiarTab('historial');
    };

    const renderizarHistorialMiniaturas = () => {
        const grid = document.getElementById('grid-miniaturas');
        grid.innerHTML = '';

        if (incidenciasDelProyecto.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #888;">No hay registros locales para este proyecto aún.</p>';
            return;
        }

        incidenciasDelProyecto.forEach((inc, index) => {
            const card = document.createElement('div');
            card.className = 'miniatura-card';
            card.onclick = () => {
                mostrarIncidenciaEnFormulario(index);
                cambiarTab('nuevo'); // Llevamos al usuario al formulario
            };

            const imgPlaceholder = inc.fotoUrl
                ? `<img src="${inc.fotoUrl}" alt="Evidencia">`
                : `<div style="height: 120px; background: #ddd; display: flex; align-items:center; justify-content:center; color: #666;">Sin Foto</div>`;

            // Indicador de color según estatus
            const colorEstatus = inc.diagnostico === 'Terminado' ? '#16a34a' : '#ea580c';

            card.innerHTML = `
            ${imgPlaceholder}
            <div class="miniatura-info">
                <h4>${inc.area || 'Sin Área'}</h4>
                <p>${inc.elemento || 'Sin elemento'}</p>
                <p style="color: ${colorEstatus}; font-weight: bold; margin-top: 5px;">${inc.diagnostico || ''}</p>
            </div>
        `;
            grid.appendChild(card);
        });
    };





});




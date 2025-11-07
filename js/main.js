document.addEventListener('DOMContentLoaded', () => {

    // ==== INICIO DE NUEVA FUNCIÓN (Establecer Fecha/Hora) ====
    /**
     * Establece la fecha y hora actual en el input #fecha
     */
    const setDefaultDateTime = () => {
        const fechaInput = document.getElementById('fecha');
        if (!fechaInput) return;

        const now = new Date();
        
        // Formatear la fecha a YYYY-MM-DDTHH:MM (requerido por datetime-local)
        // Se usa la zona horaria local del usuario
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0'); // M(0-11) -> (1-12)
        const dd = String(now.getDate()).padStart(2, '0');
        
        // ==== INICIO DE CAMBIO: Formato de Fecha ====
        // El input en el HTML ahora es type="date", por lo que solo acepta "YYYY-MM-DD"
        // const hh = String(now.getHours()).padStart(2, '0');
        // const min = String(now.getMinutes()).padStart(2, '0');
        
        // Formato final: YYYY-MM-DD
        const formattedDate = `${yyyy}-${mm}-${dd}`;
        
        fechaInput.value = formattedDate;
        // ==== FIN DE CAMBIO ====
    };
    // ==== FIN DE NUEVA FUNCIÓN ====


    // --- Referencias a los elementos ---
    const form = document.getElementById('incidencia-form');
    const generateReportButton = document.getElementById('generate-report-btn');
    const downloadReportLink = document.getElementById('download-report-link');
    const loaderOverlay = document.getElementById('loader-overlay');
    const submitButton = document.getElementById('submit-form-btn');
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
    const context = cameraPreview.getContext('2d');
    let currentStream = null;
    let animationFrameId = null;

    // --- URL de tu Web App ---
    const webAppUrl = 'https://script.google.com/macros/s/AKfycbzsdh5nHJjv4UHssD9pJ_2BrfqhNkhvl4RWJqlYgQyCHL9Sg6UP69f4zMqjGasiqCaeBQ/exec';

    // --- Lógica de Cargar Proyectos ---
    const cargarProyectos = async () => {
        const proyectoSelect = document.getElementById('proyecto-select');
        
        try {
            const response = await fetch(webAppUrl, {
                method: 'POST',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify({ action: 'getProyectos' })
            });

            const result = await response.json();

            if (result.status === 'error') {
                throw new Error(result.message);
            }

            poblarSelectProyectos(result.proyectos);

        } catch (error) {
            console.error('Error al cargar proyectos:', error);
            proyectoSelect.innerHTML = `<option value="" disabled selected>Error al cargar proyectos</option>`;
            alert(`Error fatal al cargar proyectos: ${error.message}. La página no funcionará correctamente.`);
        }
    };

    const poblarSelectProyectos = (proyectos) => {
        const proyectoSelect = document.getElementById('proyecto-select');
        
        proyectoSelect.innerHTML = ''; 

        if (!proyectos || proyectos.length === 0) {
            proyectoSelect.innerHTML = `<option value="" disabled selected>No se encontraron proyectos</option>`;
            return;
        }

        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = "Selecciona un proyecto...";
        defaultOption.disabled = true;
        defaultOption.selected = true;
        proyectoSelect.appendChild(defaultOption);

        proyectos.forEach(proyecto => {
            const option = document.createElement('option');
            
            // ==== INICIO DE CAMBIO ====
            // El servidor ahora envía 'id' (Sheet ID) y 'folderUrl' (Drive Folder)
            // Necesitamos AMBOS. Los guardaremos como un objeto JSON
            // stringificado en el 'value' del select.
            
            const projectData = {
              sheetId: proyecto.id,
              folderUrl: proyecto.folderUrl
            };
            
            // Guardamos el JSON como un string en el value
            option.value = JSON.stringify(projectData);
            
            // ==== FIN DE CAMBIO ====

            option.textContent = proyecto.nombre;
            proyectoSelect.appendChild(option);
        });
    };
    
    // --- Funciones para el loader ---
    const showLoader = (message = 'Cargando...') => {
        const loaderMessage = loaderOverlay.querySelector('p');
        if (loaderMessage) {
            loaderMessage.textContent = message;
        }
        loaderOverlay.classList.remove('hidden');
    };
    const hideLoader = () => {
        loaderOverlay.classList.add('hidden');
    };

    // --- Lógica de la cámara (REESTRUCTURADA) ---

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
            
            const currentCameraId = currentStream.getVideoTracks()[0]?.getSettings()?.deviceId;
            if (currentCameraId) {
                localStorage.setItem('preferredCameraId', currentCameraId);
            }

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
                startDrawingLoop(containerWidth); // Pasamos el tamaño lógico
                openCameraButton.classList.add('hidden');
                
                capturePhotoButton.textContent = 'Capturar Foto';
                capturePhotoButton.disabled = false;
                capturePhotoButton.classList.remove('is-captured');

                capturePhotoButton.classList.remove('hidden'); 
                selectGalleryButton.classList.add('hidden'); // Ocultar galería al abrir cámara
                retakePhotoButton.classList.add('hidden'); 
                
                updateCameraList();
            };

        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            alert(`Error al iniciar la cámara: ${error.message}. ¿Diste permisos?`);
            resetCameraUI();
        }
    };

    const updateCameraList = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            if (videoDevices.length <= 1) {
                cameraSelect.classList.add('hidden');
                return; 
            }

            const currentCameraId = currentStream?.getVideoTracks()[0]?.getSettings()?.deviceId;

            cameraSelect.innerHTML = '';
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Cámara ${videoDevices.indexOf(device) + 1}`;
                if (device.deviceId === currentCameraId) {
                    option.selected = true;
                }
                cameraSelect.appendChild(option);
            });
            cameraSelect.classList.remove('hidden');

        } catch (err) {
            console.error('Error enumerando dispositivos:', err);
            cameraSelect.classList.add('hidden');
        }
    };

    /**
     * Inicia la cámara por primera vez
     */
    const openCamera = async () => {

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("navigator.mediaDevices.getUserMedia no está disponible.");
            alert("No se puede acceder a la cámara. Asegúrate de que estás en una conexión segura (https://) y has concedido permisos.");
            return;
        }
        
        const preferredCameraId = localStorage.getItem('preferredCameraId');
        if (preferredCameraId) {
            try {
                console.log('Intentando abrir cámara preferida:', preferredCameraId);
                const preferredConstraints = { 
                    video: { 
                        deviceId: { exact: preferredCameraId },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        advanced: [
                            { focusMode: 'continuous' }
                        ]
                    } 
                };
                await startStream(preferredConstraints);
                return; // Si tiene éxito, salimos de la función
            } catch (err) {
                console.warn('No se pudo abrir la cámara preferida. Volviendo al default.', err);
                localStorage.removeItem('preferredCameraId'); // Limpiar ID inválido
            }
        }
        
        const constraints_hd_rear = { 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                advanced: [ // Pedir enfoque continuo
                    { focusMode: 'continuous' }
                ]
            } 
        };
        
        try {
            await startStream(constraints_hd_rear);
        } catch (err) {
            console.warn("Fallo al obtener 'environment' en HD. Probando frontal/default en HD.");
            
            const constraints_hd_front = { 
                video: { 
                    width: { ideal: 1920 }, 
                    height: { ideal: 1080 },
                    advanced: [ // También para la frontal, por si acaso
                        { focusMode: 'continuous' }
                    ]
                } 
            };
            
            try {
                await startStream(constraints_hd_front);
            } catch (err2) {
                console.warn("Fallaron las cámaras HD. Probando 'video: true' (baja res)");
                await startStream({ video: true }); 
            }
        }
    };

    const resetCameraUI = () => {
        stopCurrentStream();
        
        const containerWidth = cameraPreview.parentElement.offsetWidth || 300;
        const dpr = window.devicePixelRatio || 1;
        
        context.clearRect(0, 0, cameraPreview.width, cameraPreview.height);
        context.setTransform(1, 0, 0, 1, 0, 0); 
        
        cameraPreview.width = containerWidth * dpr;
        cameraPreview.height = containerWidth * dpr;
        cameraPreview.style.width = `${containerWidth}px`;
        cameraPreview.style.height = `${containerWidth}px`;
        
        cameraPreview.classList.add('hidden');
        cameraPlaceholder.classList.remove('hidden');
        cameraPlaceholder.textContent = 'La cámara está apagada';
        capturePhotoButton.classList.add('hidden'); 
        capturePhotoButton.textContent = 'Capturar Foto';
        capturePhotoButton.disabled = false;
        capturePhotoButton.classList.remove('is-captured');
        openCameraButton.classList.remove('hidden');
        
        selectGalleryButton.classList.remove('hidden'); // Mostrar botón de galería
        if (galleryInput) {
            galleryInput.value = null; // Limpiar el input de archivo
        }

        hiddenImageInput.value = '';
        cameraSelect.classList.add('hidden'); 
        retakePhotoButton.classList.add('hidden'); 
    };


    // Dibuja el video en el canvas de VISTA PREVIA
    const startDrawingLoop = (containerWidth) => {
        const draw = () => {
            if (!currentStream) return;
            const videoWidth = cameraStream.videoWidth;
            const videoHeight = cameraStream.videoHeight;
            const size = Math.min(videoWidth, videoHeight);
            const x = (videoWidth - size) / 2;
            const y = (videoHeight - size) / 2;
            
            context.clearRect(0, 0, containerWidth, containerWidth); 
            context.drawImage(cameraStream, x, y, size, size, 0, 0, containerWidth, containerWidth);
            
            animationFrameId = requestAnimationFrame(draw);
        };
        draw();
    };

    /**
     * Captura la foto en alta resolución
     */
    const capturePhoto = () => {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }

        const videoWidth = cameraStream.videoWidth;
        const videoHeight = cameraStream.videoHeight;
        const size = Math.min(videoWidth, videoHeight);
        const x = (videoWidth - size) / 2;
        const y = (videoHeight - size) / 2;

        context.setTransform(1, 0, 0, 1, 0, 0); 

        cameraPreview.width = size;
        cameraPreview.height = size;
        
        context.drawImage(cameraStream, x, y, size, size, 0, 0, size, size);

        const imageDataUrl = cameraPreview.toDataURL('image/jpeg', 0.9);
        hiddenImageInput.value = imageDataUrl;
        
        stopCurrentStream(); 
        
        capturePhotoButton.textContent = 'Foto Capturada ✔';
        capturePhotoButton.classList.add('is-captured');
        capturePhotoButton.disabled = true;
        capturePhotoButton.classList.add('hidden'); 
        retakePhotoButton.classList.remove('hidden'); 
        cameraSelect.classList.add('hidden');
    };

    /**
     * Maneja la selección de un archivo de la galería
     */
    const handleGalleryFile = (file) => {
        if (!file || !file.type.startsWith('image/')) {
            alert('Por favor, selecciona un archivo de imagen válido.');
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                stopCurrentStream();

                const videoWidth = img.width;
                const videoHeight = img.height;
                const size = Math.min(videoWidth, videoHeight);
                const x = (videoWidth - size) / 2;
                const y = (videoHeight - size) / 2;

                context.setTransform(1, 0, 0, 1, 0, 0);

                cameraPreview.width = size;
                cameraPreview.height = size;
                
                context.drawImage(img, x, y, size, size, 0, 0, size, size);

                const imageDataUrl = cameraPreview.toDataURL('image/jpeg', 0.9);
                hiddenImageInput.value = imageDataUrl;

                const containerWidth = cameraPreview.parentElement.offsetWidth;
                cameraPreview.style.width = `${containerWidth}px`;
                cameraPreview.style.height = `${containerWidth}px`;

                cameraPreview.classList.remove('hidden');
                cameraPlaceholder.classList.add('hidden');
                
                openCameraButton.classList.add('hidden');
                selectGalleryButton.classList.add('hidden');
                capturePhotoButton.classList.add('hidden');
                retakePhotoButton.classList.remove('hidden'); // <-- Mostrar "Reintentar"
                cameraSelect.classList.add('hidden');
            };
            img.src = e.target.result; 
        };

        reader.onerror = (err) => {
            console.error('Error al leer el archivo:', err);
            alert('No se pudo leer el archivo de imagen.');
        };

        reader.readAsDataURL(file); 
    };
    
    // --- Lógica de envío ---
    const handleFormSubmit = async (event) => {
        event.preventDefault();
        if (!hiddenImageInput.value) { 
            alert('Por favor, captura una foto de evidencia.'); 
            return; 
        }
        
        const payload = Object.fromEntries(new FormData(form));
        
        // ==== INICIO DE CAMBIO: Capturar Proyecto manualmente ====
        // Como el <select> de proyecto está FUERA del <form>, 
        // FormData no lo captura. Debemos añadirlo manualmente.
        const proyectoSelect = document.getElementById('proyecto-select');
        if (proyectoSelect) {
            // ==== INICIO DE CAMBIO ====
            // El 'value' ahora es el JSON stringificado (ej: {"sheetId":"...", "folderUrl":"..."})
            // Lo enviamos tal cual. El servidor se encargará de parsearlo.
            payload.proyectoInfo = proyectoSelect.value;
            // ==== FIN DE CAMBIO ====
        }
        // ==== FIN DE CAMBIO ====


        // ==== INICIO DE CAMBIO: Revisar si el payload tiene el ID
        // Ahora revisamos la nueva propiedad 'proyectoInfo'
        if (!payload.proyectoInfo) {
             // Mensaje de error actualizado (ya no necesita recargar)
             alert('Error: No se ha seleccionado ningún proyecto. Por favor, selecciona un proyecto.');
             return;
        }
        // ==== FIN DE CAMBIO ====

        payload.imagenBase64 = payload.imagenIncidencia;
        delete payload.imagenIncidencia;
        
        showLoader('Registrando incidencia...');
        try {
            const response = await fetch(webAppUrl, {
                method: 'POST',
                redirect: 'follow', 
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8' 
                },
                body: JSON.stringify({ action: 'registrarIncidencia', payload: payload })
            });

            const result = await response.json();
            if (result.status === 'error') {
                throw new Error(result.message);
            }

            alert(`¡Incidencia registrada con éxito! ID: ${result.newId}`);
            resetForm();
            
        } catch (error) {
            alert(`Hubo un error al registrar la incidencia: ${error.message}`);
        } finally {
            hideLoader();
        }
    };
    
    // --- Lógica de reporte ---
    const handleGenerateReport = async () => {
        const proyectoSelect = document.getElementById('proyecto-select');
        
        // ==== INICIO DE CAMBIO ====
        // Obtenemos el JSON stringificado del 'value'
        const proyectoInfoString = proyectoSelect.value;
        
        if (!proyectoInfoString) {
        // ==== FIN DE CAMBIO ====
            alert("Por favor, selecciona un proyecto antes de generar un reporte.");
            return;
        }

        showLoader('Generando reporte en Drive...');
        downloadReportLink.classList.add('hidden');
        
        try {
            const response = await fetch(webAppUrl, {
                method: 'POST',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify({ 
                    action: 'generarReporte',
                    // ==== INICIO DE CAMBIO ====
                    // Enviamos el JSON stringificado al servidor
                    payload: { proyectoInfo: proyectoInfoString } 
                    // ==== FIN DE CAMBIO ====
                })
            });

            const result = await response.json(); 

            if (result.status === 'error') {
                throw new Error(result.message);
            }

            alert('Reporte generado. ¡Ya puedes descargarlo!');
            
            downloadReportLink.href = result.downloadUrl; 
            downloadReportLink.target = "_blank";
            downloadReportLink.classList.remove('hidden');

        } catch (error) {
            alert(`Hubo un error al generar el reporte: ${error.message}`);
        } finally {
            hideLoader();
        }
    };

    // --- resetForm ---
    const resetForm = () => {
        form.reset(); // Esto borra la fecha y otros campos
        resetCameraUI();
        
        // ==== INICIO DE CAMBIO: Corrección del error 'proyectoSheetId' ====
        // La línea 'proyectoSelect.selectedIndex = 0;' se ha eliminado.
        // Ahora, el 'form.reset()' pondrá el dropdown en su estado inicial 
        // (que es "Selecciona un proyecto..." si la lista ya cargó),
        // pero NO lo forzaremos a 0 si el usuario quiere mantener el proyecto.
        
        // PERO, para evitar el error, es mejor NO resetear el proyecto.
        // Vamos a guardar el proyecto actual y restaurarlo después del reset.
        const proyectoSelect = document.getElementById('proyecto-select');
        let currentProjectValue = null;
        if (proyectoSelect) {
            currentProjectValue = proyectoSelect.value;
        }

        form.reset(); // Resetea todo (incluido el proyecto a "Selecciona...")
        resetCameraUI(); // Resetea la cámara

        // Ahora, restauramos el valor del proyecto
        // NOTA: Esta lógica se mantiene, ya que sacar el <select> del <form>
        // previene que form.reset() lo afecte, pero es bueno tenerlo por si acaso.
        if (proyectoSelect && currentProjectValue) {
            proyectoSelect.value = currentProjectValue;
        }
        // ==== FIN DE CAMBIO ====
        
        // Volver a poner la fecha/hora actual después de resetear
        setDefaultDateTime(); 
    };

    /**
     * Intenta forzar un re-enfoque de la cámara (Tap-to-Focus)
     */
    const handleManualFocus = async () => {
        if (!currentStream) return; // No hacer nada si la cámara está apagada

        const track = currentStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();

        if (!capabilities.focusMode) {
            console.warn('El dispositivo no soporta focusMode.');
            return;
        }

        try {
            await track.applyConstraints({
                advanced: [{ focusMode: 'manual' }]
            });
            
            await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
            });
            console.log('Re-enfoque solicitado.');
        } catch (err) {
            console.error('Error al aplicar constraints de enfoque:', err);
        }
    };


    // --- Asignar eventos ---
    
    setDefaultDateTime(); // <-- Se llama al cargar la página
    cargarProyectos();
    form.addEventListener('submit', handleFormSubmit);
    generateReportButton.addEventListener('click', handleGenerateReport);
    openCameraButton.addEventListener('click', openCamera);
    capturePhotoButton.addEventListener('click', capturePhoto);
    
    // 'Reintentar' ahora resetea la UI para permitir elegir de nuevo
    retakePhotoButton.addEventListener('click', resetCameraUI); 

    // Botón 'Galería' hace clic en el input de archivo oculto
    selectGalleryButton.addEventListener('click', () => {
        galleryInput.click();
    });

    // El input de archivo oculto maneja la selección
    galleryInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleGalleryFile(e.target.files[0]);
        }
    });

    cameraPreview.addEventListener('click', handleManualFocus); // (Tap-to-Focus)

    // Listener para el CAMBIO de cámara
    cameraSelect.addEventListener('change', (e) => {
        const newCameraId = e.target.value;
        if (newCameraId) {
            
            startStream({ 
                video: { 
                    deviceId: { exact: newCameraId },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    advanced: [
                        { focusMode: 'continuous' }
                    ]
                } 
            });
        }
    });
});
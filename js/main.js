document.addEventListener('DOMContentLoaded', () => {

    // --- 1. OBTENER REFERENCIAS A LOS ELEMENTOS DEL HTML ---
    const form = document.getElementById('incidencia-form');
    const submitButton = document.getElementById('submit-form-btn');
    const openCameraButton = document.getElementById('open-camera-btn');
    const capturePhotoButton = document.getElementById('capture-photo-btn');
    const cameraStream = document.getElementById('camera-stream');
    const cameraPreview = document.getElementById('camera-preview');
    const cameraPlaceholder = document.getElementById('camera-placeholder');
    const hiddenImageInput = document.getElementById('imagenIncidencia');
    const generateReportButton = document.getElementById('generate-report-btn');
    const reportLinkContainer = document.getElementById('report-link-container');
    const reportLink = document.getElementById('report-link');
    const loaderOverlay = document.getElementById('loader-overlay');

    const context = cameraPreview.getContext('2d');
    let stream = null;
    let animationFrameId = null;

    // --- FUNCIONES PARA CONTROLAR EL LOADER ---
    const showLoader = () => {
        loaderOverlay.style.display = 'flex';
    };
    const hideLoader = () => {
        loaderOverlay.style.display = 'none';
    };

    // --- 2. LÓGICA DE LA CÁMARA ---
    const openCamera = async () => {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            cameraStream.srcObject = stream;
            cameraStream.onloadedmetadata = () => {
                const containerWidth = cameraPreview.parentElement.offsetWidth;
                cameraPreview.width = containerWidth;
                cameraPreview.height = containerWidth;
                cameraPreview.classList.remove('hidden');
                cameraPlaceholder.classList.add('hidden');
                startDrawingLoop();
                openCameraButton.classList.add('hidden');
                capturePhotoButton.classList.remove('hidden');
            };
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            alert('No se pudo acceder a la cámara. Asegúrate de haber dado los permisos necesarios.');
            cameraPlaceholder.textContent = 'Error al iniciar la cámara.';
        }
    };

    const startDrawingLoop = () => {
        const draw = () => {
            const videoWidth = cameraStream.videoWidth;
            const videoHeight = cameraStream.videoHeight;
            const size = Math.min(videoWidth, videoHeight);
            const x = (videoWidth - size) / 2;
            const y = (videoHeight - size) / 2;
            context.drawImage(cameraStream, x, y, size, size, 0, 0, cameraPreview.width, cameraPreview.height);
            animationFrameId = requestAnimationFrame(draw);
        };
        draw();
    };

    const capturePhoto = () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        const imageDataUrl = cameraPreview.toDataURL('image/jpeg', 0.9);
        hiddenImageInput.value = imageDataUrl;
        console.log('Foto capturada y guardada en el formulario.');
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        capturePhotoButton.textContent = 'Foto Capturada ✔';
        capturePhotoButton.classList.remove('bg-[#C51E1F]', 'hover:bg-[#a32a2a]');
        capturePhotoButton.classList.add('bg-green-600');
        capturePhotoButton.disabled = true;
    };

    // --- 3. LÓGICA DE FORMULARIOS Y REPORTES ---
    const handleFormSubmit = async (event) => {
        event.preventDefault();
        if (!hiddenImageInput.value) {
            alert('Por favor, captura una foto de evidencia antes de registrar la incidencia.');
            return;
        }

        const webAppUrl = 'https://script.google.com/macros/s/AKfycbxMr9lKd4Pg8_6JzzNCx0ttFldga5quSMxs56dVyWsvecF5raPhA2V7S4rB7GBCSz3MRw/exec'; 

        const formData = {
            action: 'registrarIncidencia',
            payload: {
                fecha: form.fecha.value,
                area: form.area.value,
                elementoInspeccionado: form.elementoInspeccionado.value,
                especialidad: form.especialidad.value,
                descripcion: form.descripcion.value,
                diagnostico: form.diagnostico.value,
                imagenBase64: hiddenImageInput.value
            }
        };

        showLoader();

        try {
            await fetch(webAppUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            alert('¡Incidencia registrada con éxito!');
            resetForm();
        } catch (error) {
            console.error('Error al enviar el formulario:', error);
            alert(`Hubo un error al registrar la incidencia: ${error.message}`);
        } finally {
            hideLoader();
        }
    };

    const handleGenerateReport = async () => {
        const webAppUrl = 'https://script.google.com/macros/s/AKfycbxMr9lKd4Pg8_6JzzNCx0ttFldga5quSMxs56dVyWsvecF5raPhA2V7S4rB7GBCSz3MRw/exec'; 
        
        const requestData = {
            action: 'generarReporte'
        };

        showLoader();
        reportLinkContainer.style.display = 'none';

        try {
            await fetch(webAppUrl, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify(requestData),
                headers: { 'Content-Type': 'application/json' }
            });
            alert('Comando de generación de reporte enviado. El archivo aparecerá en tu carpeta de Google Drive en unos momentos.');
        } catch (error) {
            console.error('Error al generar el reporte:', error);
            alert(`Hubo un error al enviar el comando de generación: ${error.message}`);
        } finally {
            hideLoader();
        }
    };

    // --- 4. FUNCIÓN PARA RESETEAR EL FORMULARIO ---
    const resetForm = () => {
        form.reset();
        context.clearRect(0, 0, cameraPreview.width, cameraPreview.height);
        cameraPreview.classList.add('hidden');
        cameraPlaceholder.classList.remove('hidden');
        cameraPlaceholder.textContent = 'La cámara está apagada';
        capturePhotoButton.classList.add('hidden');
        capturePhotoButton.textContent = 'Capturar Foto';
        capturePhotoButton.disabled = false;
        capturePhotoButton.classList.remove('bg-green-600');
        capturePhotoButton.classList.add('bg-[#C51E1F]', 'hover:bg-[#a32a2a]');
        openCameraButton.classList.remove('hidden');
        hiddenImageInput.value = '';
    };

    // --- 5. ASIGNAR LOS EVENTOS A LOS BOTONES ---
    form.addEventListener('submit', handleFormSubmit);
    generateReportButton.addEventListener('click', handleGenerateReport);
    openCameraButton.addEventListener('click', openCamera);
    capturePhotoButton.addEventListener('click', capturePhoto);
});

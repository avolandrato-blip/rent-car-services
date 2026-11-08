(() => {
  const $ = id => document.getElementById(id);
  const state = { loaded: false, loading: false, error: '', signatureData: '' };
  let canvasReady = false;
  let drawing = false;
  let hasInk = false;
  let context = null;

  function client() { return window.rentCarSupabase; }

  function showState(messageOverride = '') {
    const status = $('owner-signature-status');
    const preview = $('owner-signature-preview');
    if (preview) {
      preview.src = state.signatureData || '';
      preview.classList.toggle('hidden', !state.signatureData);
    }
    if (!status) return;
    if (messageOverride) status.textContent = messageOverride;
    else if (state.loading) status.textContent = 'Chargement de votre signature…';
    else if (state.error) status.textContent = `Impossible de charger la signature : ${state.error}`;
    else if (state.signatureData) status.textContent = 'Signature enregistrée dans l’espace privé. Elle ne sera insérée qu’après votre confirmation pour chaque document.';
    else status.textContent = 'Aucune signature enregistrée. Vous pourrez continuer à générer des documents sans signature.';
  }

  function setupCanvas() {
    const canvas = $('owner-signature-canvas');
    if (!canvas || canvas.getBoundingClientRect().width === 0) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * scale);
    const height = Math.round(rect.height * scale);
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
      if (hasInk) {
        hasInk = false;
        showState('La zone a changé de taille. Redessinez votre signature avant de l’enregistrer.');
      }
    }
    context = canvas.getContext('2d');
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.strokeStyle = '#132f45';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    canvasReady = true;
  }

  function point(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDrawing(event) {
    if (!canvasReady) setupCanvas();
    if (!context) return;
    event.preventDefault();
    drawing = true;
    hasInk = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const p = point(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(p.x + 0.01, p.y + 0.01);
    context.stroke();
  }

  function draw(event) {
    if (!drawing || !context) return;
    event.preventDefault();
    const p = point(event);
    context.lineTo(p.x, p.y);
    context.stroke();
  }

  function stopDrawing() { drawing = false; }

  function clearCanvas() {
    const canvas = $('owner-signature-canvas');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
    showState('Dessin effacé. Vous pouvez signer à nouveau.');
  }

  async function loadSavedSignature() {
    const supabase = client();
    if (!supabase) return;
    state.loading = true;
    state.error = '';
    showState();
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData?.session) {
        state.signatureData = '';
        state.error = 'Connectez-vous à l’administration pour accéder à la signature.';
        return;
      }
      const { data, error } = await supabase.from('admin_signature_settings').select('signature_data').eq('id', 'lessor').maybeSingle();
      if (error) throw error;
      state.signatureData = data?.signature_data || '';
      state.loaded = true;
    } catch (error) {
      state.signatureData = '';
      state.error = error?.message || 'Erreur inattendue';
    } finally {
      state.loading = false;
      showState();
    }
  }

  async function saveSignature() {
    const status = $('owner-signature-status');
    const canvas = $('owner-signature-canvas');
    const button = $('owner-signature-save');
    if (!hasInk || !canvas) {
      showState('Dessinez d’abord votre signature dans la zone.');
      return;
    }
    const signatureData = canvas.toDataURL('image/png');
    if (signatureData.length > 500000) {
      showState('Image trop volumineuse. Effacez le dessin puis signez plus simplement.');
      return;
    }
    const supabase = client();
    if (!supabase) {
      showState('La connexion à la base de données est indisponible.');
      return;
    }
    button.disabled = true;
    showState('Enregistrement sécurisé en cours…');
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData?.user) throw new Error('Connectez-vous à l’administration avant d’enregistrer votre signature.');
      const { error } = await supabase.from('admin_signature_settings').upsert({
        id: 'lessor',
        signature_data: signatureData,
        updated_by: userData.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
      state.signatureData = signatureData;
      state.loaded = true;
      state.error = '';
      showState('Signature enregistrée dans l’espace privé. Elle ne sera insérée qu’après votre confirmation pour chaque document.');
    } catch (error) {
      showState(`Enregistrement impossible : ${error?.message || 'Erreur inattendue'}`);
    } finally {
      button.disabled = false;
    }
  }

  window.getLessorSignatureForPrint = () => state.signatureData;
  window.getLessorSignatureState = () => ({ loaded: state.loaded, loading: state.loading, error: state.error, available: Boolean(state.signatureData) });
  window.loadLessorSignature = loadSavedSignature;

  const canvas = $('owner-signature-canvas');
  if (canvas) {
    canvas.addEventListener('pointerdown', startDrawing);
    canvas.addEventListener('pointermove', draw);
    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);
  }
  $('owner-signature-clear')?.addEventListener('click', clearCanvas);
  $('owner-signature-save')?.addEventListener('click', saveSignature);
  document.querySelector('.nav button[data-tab="signature"]')?.addEventListener('click', () => requestAnimationFrame(setupCanvas));
  window.addEventListener('resize', () => { if ($('signature')?.classList.contains('active')) setupCanvas(); });
  if (client()?.auth?.onAuthStateChange) {
    client().auth.onAuthStateChange((_event, session) => {
      if (session) loadSavedSignature();
      else { state.loaded = true; state.signatureData = ''; state.error = 'Connectez-vous à l’administration pour accéder à la signature.'; showState(); }
    });
  }
  loadSavedSignature();
})();

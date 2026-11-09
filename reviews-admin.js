(() => {
  const db = window.rentCarSupabase;
  const BUCKET = 'site-review-photos';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const safeImageUrl = value => {
    try {
      const url = new URL(String(value || ''), window.location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  };
  const starText = rating => `${'★'.repeat(Math.max(0, Math.min(5, Number(rating) || 0)))}${'☆'.repeat(5 - Math.max(0, Math.min(5, Number(rating) || 0)))}`;
  let rows = [];

  function setStatus(message, error = false) {
    const status = $('review-form-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('review-admin-error', error);
  }
  function resetForm() {
    const form = $('site-review-form');
    if (!form) return;
    form.reset();
    $('site-review-id').value = '';
    $('review-photo-preview').innerHTML = '';
    $('site-review-active').value = 'true';
    $('review-photo-file').required = true;
    $('site-review-form-title').textContent = 'Ajouter un avis';
    $('review-save-button').textContent = 'Enregistrer l’avis';
    setStatus('');
    form.classList.add('hidden');
  }
  function showForm() {
    resetForm();
    $('site-review-form').classList.remove('hidden');
    $('site-review-text').focus();
  }
  function previewFile(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      $('review-photo-file').value = '';
      setStatus('Choisissez un fichier image.', true);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      $('review-photo-file').value = '';
      setStatus('La photo doit faire 5 Mo maximum.', true);
      return;
    }
    const url = URL.createObjectURL(file);
    $('review-photo-preview').innerHTML = `<img src="${url}" alt="Aperçu de la photo miniature">`;
    $('review-photo-preview').querySelector('img')?.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
    setStatus('');
  }

  async function loadReviewsAdmin() {
    const host = $('site-reviews-table');
    if (!host || !db) return;
    host.innerHTML = '<p class="notice">Chargement des avis…</p>';
    const sessionResult = await db.auth.getSession();
    if (sessionResult.error || !sessionResult.data?.session) {
      host.innerHTML = '<p class="notice">Connectez-vous à l’administration pour gérer les avis.</p>';
      return;
    }
    const { data, error } = await db.from('site_reviews')
      .select('id,image_url,rating,review_text,active,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) {
      host.innerHTML = `<p class="notice review-admin-error">Impossible de charger les avis : ${esc(error.message)}</p>`;
      return;
    }
    rows = data || [];
    host.innerHTML = rows.length ? `<table class="table"><thead><tr><th>Avis</th><th>Note</th><th>État</th><th>Actions</th></tr></thead><tbody>${rows.map(review => {
      const photo = safeImageUrl(review.image_url);
      return `<tr><td><div class="review-admin-row">${photo ? `<img src="${esc(photo)}" alt="Photo miniature de l’avis" loading="lazy">` : ''}<span>${esc(review.review_text)}</span></div></td><td><span class="review-admin-stars" aria-label="${Number(review.rating) || 0} sur 5">${starText(review.rating)}</span><br><small>${Number(review.rating) || 0}/5</small></td><td><span class="pill ${review.active ? 'available' : 'inactive'}">${review.active ? 'Publié' : 'Masqué'}</span></td><td><div class="actions"><button class="btn outline" type="button" onclick="editSiteReview('${esc(review.id)}')">Modifier</button><button class="btn outline" type="button" onclick="toggleSiteReview('${esc(review.id)}',${!review.active})">${review.active ? 'Masquer' : 'Publier'}</button><button class="btn danger" type="button" onclick="deleteSiteReview('${esc(review.id)}')">Supprimer</button></div></td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty">Aucun avis enregistré. Ajoutez votre premier avis ci-dessus.</div>';
  }

  function editSiteReview(id) {
    const review = rows.find(row => row.id === id);
    if (!review) return;
    $('site-review-id').value = review.id;
    $('site-review-rating').value = String(review.rating);
    $('site-review-text').value = review.review_text || '';
    $('site-review-active').value = String(review.active !== false);
    $('review-photo-file').value = '';
    $('review-photo-file').required = false;
    const photo = safeImageUrl(review.image_url);
    $('review-photo-preview').innerHTML = photo ? `<img src="${esc(photo)}" alt="Photo miniature enregistrée">` : '';
    $('site-review-form-title').textContent = 'Modifier un avis';
    $('review-save-button').textContent = 'Enregistrer les modifications';
    $('site-review-form').classList.remove('hidden');
    $('site-review-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function toggleSiteReview(id, active) {
    const { error } = await db.from('site_reviews').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return alert(`Modification impossible : ${error.message}`);
    await loadReviewsAdmin();
  }

  function storedPhotoPath(imageUrl) {
    try {
      const pathname = new URL(imageUrl).pathname;
      const marker = `/storage/v1/object/public/${BUCKET}/`;
      const index = pathname.indexOf(marker);
      return index < 0 ? '' : decodeURIComponent(pathname.slice(index + marker.length));
    } catch (_) { return ''; }
  }

  async function deleteSiteReview(id) {
    if (!confirm('Supprimer cet avis ?')) return;
    const review = rows.find(row => row.id === id);
    const { error } = await db.from('site_reviews').delete().eq('id', id);
    if (error) return alert(`Suppression impossible : ${error.message}`);
    const path = review ? storedPhotoPath(review.image_url) : '';
    if (path) await db.storage.from(BUCKET).remove([path]);
    if ($('site-review-id').value === id) resetForm();
    await loadReviewsAdmin();
  }

  async function uploadPhoto(reviewId, file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100) || 'photo';
    const path = `${reviewId}/${Date.now()}-${safeName}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw new Error(`Téléversement de la photo impossible : ${error.message}`);
    return { path, url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('review-add')?.addEventListener('click', showForm);
    $('review-cancel')?.addEventListener('click', resetForm);
    $('review-refresh')?.addEventListener('click', loadReviewsAdmin);
    $('review-photo-file')?.addEventListener('change', event => previewFile(event.target.files?.[0]));
    $('site-review-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = $('review-save-button');
      const file = $('review-photo-file').files?.[0];
      const existingId = $('site-review-id').value;
      const rating = Number($('site-review-rating').value);
      const reviewText = $('site-review-text').value.trim();
      if (!existingId && !file) return setStatus('Ajoutez une photo miniature à cet avis.', true);
      if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) return setStatus('Choisissez une image JPG, PNG ou WebP de 5 Mo maximum.', true);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return setStatus('La note doit être comprise entre 1 et 5 étoiles.', true);
      if (reviewText.length < 3 || reviewText.length > 1200) return setStatus('Le texte de l’avis doit contenir entre 3 et 1 200 caractères.', true);
      button.disabled = true;
      setStatus('Enregistrement en cours…');
      let uploadedPath = null;
      try {
        const payload = { rating, review_text: reviewText, active: $('site-review-active').value === 'true', updated_at: new Date().toISOString() };
        if (existingId) {
          if (file) {
            const uploaded = await uploadPhoto(existingId, file);
            uploadedPath = uploaded.path;
            payload.image_url = uploaded.url;
          }
          const { error } = await db.from('site_reviews').update(payload).eq('id', existingId);
          if (error) throw error;
        } else {
          const id = crypto.randomUUID();
          const uploaded = await uploadPhoto(id, file);
          uploadedPath = uploaded.path;
          const { error } = await db.from('site_reviews').insert({ id, ...payload, image_url: uploaded.url });
          if (error) throw error;
        }
        uploadedPath = null;
        setStatus('Avis enregistré.');
        resetForm();
        await loadReviewsAdmin();
      } catch (error) {
        setStatus(`Erreur : ${error.message || 'enregistrement impossible'}`, true);
        if (uploadedPath) await db.storage.from(BUCKET).remove([uploadedPath]).catch(() => {});
      } finally {
        button.disabled = false;
      }
    });
    document.querySelector('.nav button[data-tab="reviews"]')?.addEventListener('click', loadReviewsAdmin);
    window.loadReviewsAdmin = loadReviewsAdmin;
    window.editSiteReview = editSiteReview;
    window.toggleSiteReview = toggleSiteReview;
    window.deleteSiteReview = deleteSiteReview;
    loadReviewsAdmin();
  });
})();

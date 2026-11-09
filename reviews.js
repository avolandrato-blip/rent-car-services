(() => {
  const root = document.getElementById('customer-reviews');
  const track = document.getElementById('reviews-track');
  const dots = document.getElementById('reviews-dots');
  if (!root || !track || !dots || !window.rentCarSupabase) return;

  let reviews = [];
  let activeIndex = 0;
  let timer = null;
  let paused = false;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const imageUrl = value => {
    try {
      const url = new URL(String(value || ''), window.location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  };

  function render() {
    if (!reviews.length) {
      root.classList.add('hidden');
      return;
    }
    track.innerHTML = reviews.map(review => {
      const photo = imageUrl(review.image_url);
      const rating = Math.max(1, Math.min(5, Number(review.rating) || 0));
      const stars = Array.from({ length: 5 }, (_, index) => `<span class="${index < rating ? 'is-filled' : ''}" aria-hidden="true">★</span>`).join('');
      return `<article class="review-slide" aria-label="Avis noté ${rating} sur 5">
        <div class="review-card">
          <div class="review-card-top">
            <span class="review-avatar" aria-hidden="true"><i class="fas fa-user"></i>${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>
            <div class="review-rating"><span class="review-stars">${stars}</span><strong>${rating}/5</strong><span class="review-rating-label">Avis client</span></div>
            <i class="fas fa-quote-right review-quote-mark" aria-hidden="true"></i>
          </div>
          <blockquote>${esc(review.review_text)}</blockquote>
        </div>
      </article>`;
    }).join('');
    dots.innerHTML = reviews.map((_, index) => `<button class="review-dot${index === activeIndex ? ' active' : ''}" type="button" data-review-index="${index}" aria-label="Afficher l’avis ${index + 1}" aria-current="${index === activeIndex ? 'true' : 'false'}"></button>`).join('');
    root.classList.remove('hidden');
    updatePosition();
    $('reviews-controls')?.classList.toggle('hidden', reviews.length < 2);
    dots.classList.toggle('hidden', reviews.length < 2);
  }

  function updatePosition() {
    if (!reviews.length) return;
    activeIndex = (activeIndex + reviews.length) % reviews.length;
    track.style.transform = `translateX(-${activeIndex * 100}%)`;
    dots.querySelectorAll('.review-dot').forEach((dot, index) => {
      const current = index === activeIndex;
      dot.classList.toggle('active', current);
      dot.setAttribute('aria-current', String(current));
    });
  }

  function stopTimer() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }
  function startTimer() {
    stopTimer();
    if (paused || reviews.length < 2 || document.hidden) return;
    timer = window.setInterval(() => { activeIndex += 1; updatePosition(); }, 5500);
  }

  $('reviews-prev')?.addEventListener('click', () => { activeIndex -= 1; updatePosition(); startTimer(); });
  $('reviews-next')?.addEventListener('click', () => { activeIndex += 1; updatePosition(); startTimer(); });
  dots.addEventListener('click', event => {
    const button = event.target.closest('[data-review-index]');
    if (!button) return;
    activeIndex = Number(button.dataset.reviewIndex);
    updatePosition();
    startTimer();
  });
  root.addEventListener('mouseenter', () => { paused = true; stopTimer(); });
  root.addEventListener('mouseleave', () => { paused = false; startTimer(); });
  root.addEventListener('focusin', () => { paused = true; stopTimer(); });
  root.addEventListener('focusout', event => {
    if (!root.contains(event.relatedTarget)) { paused = false; startTimer(); }
  });
  document.addEventListener('visibilitychange', startTimer);

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const { data, error } = await window.rentCarSupabase
        .from('site_reviews')
        .select('id,image_url,rating,review_text')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      reviews = data || [];
      render();
      startTimer();
    } catch (error) {
      console.warn('Chargement des avis impossible.', error);
      root.classList.add('hidden');
    }
  });
})();

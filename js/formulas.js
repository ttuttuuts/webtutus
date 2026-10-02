/* ============================================================
   FORMULAS MODULE
   ============================================================ */
(function () {
  'use strict';

  const FRAC = (n, d) => `<span class="frac"><span class="num">${n}</span><span class="den">${d}</span></span>`;

  const FORMULAS = {
    math: { label: 'Toán', icon: '📐', groups: [
      { title: 'Hằng đẳng thức', items: [
        { name: 'Bình phương của tổng', body: '(a + b)² = a² + 2ab + b²' },
        { name: 'Bình phương của hiệu', body: '(a − b)² = a² − 2ab + b²' },
        { name: 'Hiệu hai bình phương', body: 'a² − b² = (a − b)(a + b)' },
        { name: 'Lập phương tổng', body: '(a + b)³ = a³ + 3a²b + 3ab² + b³' },
        { name: 'Tổng hai lập phương', body: 'a³ + b³ = (a + b)(a² − ab + b²)' },
      ]},
      { title: 'Luỹ thừa — Căn', items: [
        { name: 'Nhân luỹ thừa', body: 'aᵐ · aⁿ = aᵐ⁺ⁿ' },
        { name: 'Chia luỹ thừa', body: 'aᵐ ÷ aⁿ = aᵐ⁻ⁿ' },
        { name: 'Luỹ thừa âm', body: 'a⁻ⁿ = ' + FRAC('1', 'aⁿ') },
        { name: 'Luỹ thừa phân số', body: 'a^(m/n) = ⁿ√(aᵐ)' },
      ]},
      { title: 'Logarit', items: [
        { name: 'Định nghĩa', body: 'log_a b = c ⇔ aᶜ = b' },
        { name: 'Logarit của tích', body: 'log_a(bc) = log_a b + log_a c' },
        { name: 'Logarit của thương', body: 'log_a(b/c) = log_a b − log_a c' },
        { name: 'Đổi cơ số', body: 'log_a b = ' + FRAC('log_c b', 'log_c a') },
      ]},
      { title: 'PT — BĐT', items: [
        { name: 'PT bậc hai', body: 'ax² + bx + c = 0 ⇒ x = ' + FRAC('−b ± √Δ', '2a') },
        { name: 'Vi-ét', body: 'x₁ + x₂ = ' + FRAC('−b', 'a') + ', x₁·x₂ = ' + FRAC('c', 'a') },
        { name: 'BĐT Cauchy 2 số', body: 'a + b ≥ 2√(ab)' },
        { name: 'BĐT Bunhiacopxki', body: '(a² + b²)(x² + y²) ≥ (ax + by)²' },
      ]},
      { title: 'Lượng giác', items: [
        { name: 'Công thức cơ bản', body: 'sin²α + cos²α = 1' },
        { name: 'Cộng — sin', body: 'sin(a ± b) = sin a·cos b ± cos a·sin b' },
        { name: 'Cộng — cos', body: 'cos(a ± b) = cos a·cos b ∓ sin a·sin b' },
        { name: 'Nhân đôi — sin', body: 'sin 2a = 2 sin a·cos a' },
        { name: 'Nhân đôi — cos', body: 'cos 2a = cos²a − sin²a' },
      ]},
      { title: 'Đạo hàm', items: [
        { name: 'Luỹ thừa', body: "(xⁿ)' = n·xⁿ⁻¹" },
        { name: 'sin', body: "(sin x)' = cos x" },
        { name: 'cos', body: "(cos x)' = −sin x" },
        { name: 'e^x', body: "(eˣ)' = eˣ" },
        { name: 'ln x', body: "(ln x)' = " + FRAC('1', 'x') },
        { name: 'Tích', body: "(uv)' = u'v + uv'" },
      ]},
      { title: 'Tích phân', items: [
        { name: 'Luỹ thừa', body: '∫ xⁿ dx = ' + FRAC('xⁿ⁺¹', 'n + 1') + ' + C' },
        { name: '1/x', body: '∫ ' + FRAC('1', 'x') + ' dx = ln|x| + C' },
        { name: 'e^x', body: '∫ eˣ dx = eˣ + C' },
        { name: 'Newton–Leibniz', body: '∫ₐᵇ f(x) dx = F(b) − F(a)' },
      ]},
      { title: 'Hình học phẳng', items: [
        { name: 'Diện tích tam giác', body: 'S = ' + FRAC('1', '2') + '·a·h' },
        { name: 'Heron', body: 'S = √(p(p−a)(p−b)(p−c))' },
        { name: 'Định lý cos', body: 'a² = b² + c² − 2bc·cos A' },
        { name: 'Định lý sin', body: FRAC('a', 'sin A') + ' = 2R' },
      ]},
      { title: 'Không gian', items: [
        { name: 'Hình cầu', body: 'V = ' + FRAC('4', '3') + 'πR³ ; S = 4πR²' },
        { name: 'Hình nón', body: 'V = ' + FRAC('1', '3') + 'πR²h' },
        { name: 'Hình trụ', body: 'V = πR²h' },
        { name: 'Hình chóp', body: 'V = ' + FRAC('1', '3') + '·S_đáy·h' },
      ]},
      { title: 'Cấp số', items: [
        { name: 'CSC', body: 'uₙ = u₁ + (n−1)d' },
        { name: 'CSN', body: 'uₙ = u₁·qⁿ⁻¹' },
      ]},
      { title: 'Tổ hợp', items: [
        { name: 'Hoán vị', body: 'Pₙ = n!' },
        { name: 'Chỉnh hợp', body: 'A(n,k) = ' + FRAC('n!', '(n−k)!') },
        { name: 'Tổ hợp', body: 'C(n,k) = ' + FRAC('n!', 'k!(n−k)!') },
        { name: 'Xác suất', body: 'P(A) = ' + FRAC('thuận lợi', 'tổng') },
      ]},
    ]},
    physics: { label: 'Lý', icon: '⚛️', groups: [
      { title: 'Cơ học', items: [
        { name: 'Vận tốc', body: 'v = ' + FRAC('s', 't') },
        { name: 'BĐĐ — v', body: 'v = v₀ + at' },
        { name: 'BĐĐ — s', body: 's = v₀t + ' + FRAC('1', '2') + 'at²' },
        { name: 'Liên hệ v − s', body: 'v² − v₀² = 2as' },
        { name: 'Rơi tự do', body: 'h = ' + FRAC('1', '2') + 'gt²' },
        { name: 'ĐL II Newton', body: 'F = ma' },
        { name: 'Trọng lực', body: 'P = mg' },
        { name: 'Động lượng', body: 'p = mv' },
        { name: 'Động năng', body: 'W = ' + FRAC('1', '2') + 'mv²' },
        { name: 'Thế năng', body: 'W = mgh' },
      ]},
      { title: 'Nhiệt học', items: [
        { name: 'PT trạng thái', body: 'pV/T = const' },
        { name: 'Boyle–Mariotte', body: 'p₁V₁ = p₂V₂' },
        { name: 'C–M', body: 'pV = nRT' },
        { name: 'Nhiệt lượng', body: 'Q = mcΔt' },
      ]},
      { title: 'Điện', items: [
        { name: 'ĐL Ôm', body: 'I = ' + FRAC('U', 'R') },
        { name: 'Công suất', body: 'P = UI = I²R' },
        { name: 'Jun–Len-xơ', body: 'Q = I²Rt' },
        { name: 'Nối tiếp', body: 'R = R₁ + R₂' },
        { name: 'Song song', body: '1/R = 1/R₁ + 1/R₂' },
      ]},
      { title: 'Dao động — Sóng', items: [
        { name: 'Con lắc lò xo', body: 'T = 2π√(m/k)' },
        { name: 'Con lắc đơn', body: 'T = 2π√(l/g)' },
        { name: 'Bước sóng', body: 'λ = v/f = vT' },
      ]},
      { title: 'Quang — Lượng tử', items: [
        { name: 'Khúc xạ', body: 'sin i / sin r = n₂/n₁' },
        { name: 'Thấu kính', body: "1/f = 1/d + 1/d'" },
        { name: 'Photon', body: 'ε = hf = hc/λ' },
        { name: 'Phóng xạ', body: 'N = N₀·2^(−t/T)' },
      ]},
    ]},
    chemistry: { label: 'Hoá', icon: '🧪', groups: [
      { title: 'Cơ bản', items: [
        { name: 'Số mol', body: 'n = m/M = V/22,4 = C_M·V' },
        { name: 'Số hạt', body: 'n = N/N_A' },
      ]},
      { title: 'Dung dịch', items: [
        { name: 'C%', body: 'C% = ' + FRAC('m_ct', 'm_dd') + '·100%' },
        { name: 'C_M', body: 'C_M = ' + FRAC('n', 'V(lít)') },
        { name: 'Pha loãng', body: 'C₁V₁ = C₂V₂' },
      ]},
      { title: 'Khí', items: [
        { name: 'PT khí lý tưởng', body: 'pV = nRT' },
        { name: 'Tỉ khối H₂', body: 'd = M_A/2' },
      ]},
      { title: 'pH', items: [
        { name: 'pH', body: 'pH = −log[H⁺]' },
        { name: 'pOH', body: 'pOH = −log[OH⁻]' },
        { name: 'Liên hệ', body: 'pH + pOH = 14' },
      ]},
    ]},
    english: { label: 'Anh', icon: '🇬🇧', groups: [
      { title: '12 thì', items: [
        { name: 'Hiện tại đơn', body: 'S + V(s/es)' },
        { name: 'Hiện tại tiếp diễn', body: 'S + am/is/are + V-ing' },
        { name: 'Hiện tại hoàn thành', body: 'S + have/has + V3/ed' },
        { name: 'Quá khứ đơn', body: 'S + V2/ed' },
        { name: 'Quá khứ tiếp diễn', body: 'S + was/were + V-ing' },
        { name: 'Tương lai đơn', body: 'S + will + V' },
      ]},
      { title: 'Câu điều kiện', items: [
        { name: 'Loại 0', body: 'If + S + V(s/es), S + V(s/es)' },
        { name: 'Loại 1', body: 'If + S + V(s/es), S + will + V' },
        { name: 'Loại 2', body: 'If + S + V2/ed, S + would + V' },
        { name: 'Loại 3', body: 'If + S + had + V3/ed, S + would have + V3/ed' },
      ]},
      { title: 'Bị động', items: [
        { name: 'Chung', body: 'S + be + V3/ed + (by O)' },
        { name: 'HTĐ', body: 'S + am/is/are + V3/ed' },
        { name: 'QKĐ', body: 'S + was/were + V3/ed' },
      ]},
      { title: 'So sánh', items: [
        { name: 'Bằng', body: 'as + adj + as' },
        { name: 'Hơn (ngắn)', body: 'adj + er + than' },
        { name: 'Hơn (dài)', body: 'more + adj + than' },
        { name: 'Nhất', body: 'the + adj + est / the most + adj' },
      ]},
      { title: 'Phát âm', items: [
        { name: '-s/-es', body: '/s/ (p,k,t,f) — /iz/ (s,x,z,ch,sh,ge) — /z/ (còn lại)' },
        { name: '-ed', body: '/id/ (t,d) — /t/ (p,k,f,s,sh,ch) — /d/ (còn lại)' },
      ]},
    ]},
    tips: { label: 'Mẹo', icon: '💡', groups: [
      { title: '⚡ Nhân nhanh', items: [
        { name: 'Nhân 11 (2 chữ số)', body: '47 × 11 → 4|4+7|7 = 517' },
        { name: 'Nhân với 5', body: 'n × 5 = n × 10 ÷ 2' },
        { name: 'Nhân với 25', body: 'n × 25 = n × 100 ÷ 4' },
        { name: 'Nhân với 9', body: 'n × 9 = n × 10 − n' },
      ]},
      { title: '⚡ Bình phương', items: [
        { name: 'Tận cùng 5', body: '35² → 3·4|25 = 1225' },
        { name: 'Gần 100', body: '98² = (100−2)² = 9604' },
        { name: 'Gần 50', body: '47² = (50−3)² = 2209' },
      ]},
      { title: '⚡ Phần trăm', items: [
        { name: '10%', body: 'Dịch dấu phẩy sang trái 1 chữ số' },
        { name: '5%', body: '10% chia đôi' },
        { name: '25%', body: 'Chia 4' },
      ]},
      { title: '⚡ Cộng dãy', items: [
        { name: '1+2+...+n', body: 'S = n(n+1)/2' },
        { name: 'Số lẻ', body: 'S = n²' },
        { name: 'Số chẵn', body: 'S = n(n+1)' },
      ]},
    ]},
  };

  const tabsEl = document.getElementById('formulaTabs');
  const contentEl = document.getElementById('formulaContent');
  const searchEl = document.getElementById('formulaSearch');
  let activeSubject = 'math';

  function stripHtml(s) { return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
  function countFormulas(subj) { return FORMULAS[subj].groups.reduce((n, g) => n + g.items.length, 0); }

  function buildTabs() {
    tabsEl.innerHTML = '';
    for (const [key, val] of Object.entries(FORMULAS)) {
      const btn = document.createElement('button');
      btn.className = 'formula-tab' + (key === activeSubject ? ' active' : '');
      btn.dataset.subject = key;
      btn.innerHTML = `<span>${val.icon}</span><span>${val.label}</span><span class="tab-count">${countFormulas(key)}</span>`;
      btn.addEventListener('click', () => {
        activeSubject = key;
        tabsEl.querySelectorAll('.formula-tab').forEach(t => t.classList.toggle('active', t.dataset.subject === key));
        renderFormulas();
      });
      tabsEl.appendChild(btn);
    }
  }

  function renderFormulas() {
    const keyword = searchEl.value.trim().toLowerCase();
    const subj = FORMULAS[activeSubject];
    let total = 0, html = '';
    for (const group of subj.groups) {
      const matched = group.items.filter(it => {
        if (!keyword) return true;
        return it.name.toLowerCase().includes(keyword) || stripHtml(it.body).toLowerCase().includes(keyword) || group.title.toLowerCase().includes(keyword);
      });
      if (matched.length === 0) continue;
      html += `<div class="formula-group"><h3 class="formula-group-title">${group.title}</h3><div class="formula-list">`;
      for (const it of matched) html += `<div class="formula-item"><div class="formula-name"><span class="fi">📌</span>${it.name}</div><div class="formula-body">${it.body}</div></div>`;
      html += `</div></div>`;
      total += matched.length;
    }
    contentEl.innerHTML = total === 0 ? `<div class="formula-empty">😕 Không tìm thấy công thức nào khớp với "${searchEl.value}".</div>` : html;
  }

  window.addEventListener('DOMContentLoaded', () => {
    buildTabs();
    renderFormulas();
    searchEl.addEventListener('input', renderFormulas);
  });
})();
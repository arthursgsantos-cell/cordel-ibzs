/* ════════════════════════════════════════════════════════════════
 *  AVATAR — personagens SVG em camadas (tema nordestino / junino)
 *  Config JSON: { bg, skin, hair, hat, acc, face }
 *  Uso:  AVATAR.render(cfg, tamanho)  → string SVG
 *        AVATAR.random()              → config aleatória
 *        AVATAR.PARTS                 → opções para a UI de customização
 * ════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── Paletas ────────────────────────────────────────────────────
  const BG = {
    milho:    '#F2C14E',
    rosa:     '#E8458C',
    azul:     '#3A6EC8',
    verde:    '#5BA85A',
    fogueira: '#E8623A',
    roxo:     '#9B5DE5',
  };

  const SKIN = {
    clara:    '#F8D5A8',
    morena:   '#E0B080',
    media:    '#C98B5E',
    parda:    '#9C6440',
    escura:   '#6E4326',
  };

  const HAIR = {
    preto:    '#2B1B14',
    castanho: '#5A3A22',
    ruivo:    '#B5651D',
    loiro:    '#D9A441',
    grisalho: '#9A9A9A',
  };

  // ── Helpers de partes ──────────────────────────────────────────
  function cabelo(estilo, cor) {
    switch (estilo) {
      case 'careca':
        return '';
      case 'longo':
        // copa cheia + mechas que descem emoldurando o rosto
        return `
          <path d="M25,50 C23,28 36,20 50,20 C64,20 77,28 75,50
                   C77,66 74,78 70,83 L62,81
                   C66,67 66,55 63,46 C61,40 57,37 50,37
                   C43,37 39,40 37,46 C34,55 34,67 38,81
                   L30,83 C26,78 23,66 25,50 Z" fill="${cor}"/>`;
      case 'coque':
        return `
          <circle cx="50" cy="17" r="8" fill="${cor}"/>
          ${capCabelo(cor)}`;
      case 'curto':
      default:
        return capCabelo(cor);
    }
  }

  // Copa cheia: cobre o topo da cabeça e desce até a linha do cabelo na testa.
  function capCabelo(cor) {
    return `<path d="M26,49 C24,29 35,21 50,21 C65,21 76,29 74,49
                     C71,40 64,37 50,37 C36,37 29,40 26,49 Z" fill="${cor}"/>`;
  }

  function chapeu(tipo) {
    switch (tipo) {
      case 'palha': // chapéu de palha junino
        return `
          <ellipse cx="50" cy="30" rx="36" ry="10" fill="#E7C272" stroke="#B8923F" stroke-width="1.5"/>
          <path d="M33,30 C33,11 67,11 67,30 Z" fill="#EFD089" stroke="#B8923F" stroke-width="1.5"/>
          <path d="M33,28 Q50,33 67,28 L67,31 Q50,36 33,31 Z" fill="#C0392B"/>`;
      case 'cangaceiro': // chapéu de couro do Lampião, abas viradas + estrelas
        return `
          <path d="M20,32 Q50,44 80,32 Q80,16 50,12 Q20,16 20,32 Z" fill="#6B4A2B" stroke="#4A3119" stroke-width="1.5"/>
          <path d="M33,22 Q50,30 67,22 L67,30 Q50,38 33,30 Z" fill="#5A3D22"/>
          <path d="M40,18 l1.4,3 3.3,.3 -2.5,2.2 .8,3.2 -2.8,-1.7 -2.8,1.7 .8,-3.2 -2.5,-2.2 3.3,-.3 z" fill="#E7C272"/>
          <path d="M59,18 l1.4,3 3.3,.3 -2.5,2.2 .8,3.2 -2.8,-1.7 -2.8,1.7 .8,-3.2 -2.5,-2.2 3.3,-.3 z" fill="#E7C272"/>`;
      case 'lenco': // bandana xadrez amarrada
        return `
          <path d="M26,30 Q50,14 74,30 Q50,24 26,30 Z" fill="#D64545"/>
          <path d="M26,30 Q50,22 74,30" fill="none" stroke="#fff" stroke-width="1" opacity="0.7"/>
          <path d="M38,20 L38,30 M50,17 L50,28 M62,20 L62,30" stroke="#fff" stroke-width="1" opacity="0.55"/>
          <path d="M74,30 q8,-2 10,4 q-6,1 -10,-1 z" fill="#C0392B"/>`;
      case 'flor': // flor no cabelo (lateral)
        return `
          <g transform="translate(70,30)">
            <circle cx="0" cy="-5" r="3.2" fill="#F25CA2"/>
            <circle cx="5" cy="-2" r="3.2" fill="#F25CA2"/>
            <circle cx="3" cy="4" r="3.2" fill="#F25CA2"/>
            <circle cx="-3" cy="4" r="3.2" fill="#F25CA2"/>
            <circle cx="-5" cy="-2" r="3.2" fill="#F25CA2"/>
            <circle cx="0" cy="0" r="2.6" fill="#F2C14E"/>
          </g>`;
      case 'fita': // fita junina com lacinho
        return `
          <path d="M27,28 Q50,22 73,28 L73,32 Q50,26 27,32 Z" fill="#3A6EC8"/>
          <path d="M50,29 l-6,-4 0,8 z M50,29 l6,-4 0,8 z" fill="#2A52A0"/>
          <circle cx="50" cy="29" r="2" fill="#fff"/>`;
      case 'none':
      default:
        return '';
    }
  }

  function expressao(tipo) {
    // olhos padrão
    const olhos = `
      <circle cx="41" cy="47" r="3" fill="#3A2A1A"/>
      <circle cx="59" cy="47" r="3" fill="#3A2A1A"/>
      <circle cx="42" cy="46" r="1" fill="#fff"/>
      <circle cx="60" cy="46" r="1" fill="#fff"/>`;
    const bochechas = `
      <ellipse cx="34" cy="55" rx="4" ry="2.6" fill="#F08AB0" opacity="0.55"/>
      <ellipse cx="66" cy="55" rx="4" ry="2.6" fill="#F08AB0" opacity="0.55"/>`;
    let boca;
    switch (tipo) {
      case 'risada':
        boca = `<path d="M42,56 Q50,66 58,56 Q50,60 42,56 Z" fill="#7A2E2E"/>
                <path d="M44,57 Q50,60 56,57" fill="#fff"/>`;
        break;
      case 'serelepe': // sorriso com a língua de fora
        boca = `<path d="M43,56 Q50,63 57,56" fill="none" stroke="#7A2E2E" stroke-width="2" stroke-linecap="round"/>
                <ellipse cx="50" cy="61" rx="3" ry="2.4" fill="#F25C7A"/>`;
        break;
      case 'sorriso':
      default:
        boca = `<path d="M43,55 Q50,62 57,55" fill="none" stroke="#7A2E2E" stroke-width="2.2" stroke-linecap="round"/>`;
    }
    return olhos + bochechas + boca;
  }

  function acessorio(tipo) {
    switch (tipo) {
      case 'sardas':
        return `
          <circle cx="35" cy="51" r="0.9" fill="#9C6440"/>
          <circle cx="38" cy="54" r="0.9" fill="#9C6440"/>
          <circle cx="33" cy="55" r="0.9" fill="#9C6440"/>
          <circle cx="65" cy="51" r="0.9" fill="#9C6440"/>
          <circle cx="62" cy="54" r="0.9" fill="#9C6440"/>
          <circle cx="67" cy="55" r="0.9" fill="#9C6440"/>`;
      case 'bigode':
        return `<path d="M42,57 Q46,54 50,57 Q54,54 58,57 Q54,60 50,58 Q46,60 42,57 Z" fill="#3A2A1A"/>`;
      case 'oculos':
        return `
          <circle cx="41" cy="47" r="6" fill="none" stroke="#3A2A1A" stroke-width="1.6"/>
          <circle cx="59" cy="47" r="6" fill="none" stroke="#3A2A1A" stroke-width="1.6"/>
          <path d="M47,47 L53,47" stroke="#3A2A1A" stroke-width="1.6"/>`;
      case 'pintinha':
        return `<circle cx="62" cy="58" r="1.3" fill="#5A3A22"/>`;
      case 'none':
      default:
        return '';
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  function render(cfg, size) {
    cfg = cfg || {};
    const s = size || 96;

    // Foto enviada/capturada pelo usuário (recortada em círculo)
    if (cfg.type === 'photo' && cfg.img) {
      return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
        <defs><clipPath id="ap"><circle cx="50" cy="50" r="50"/></clipPath></defs>
        <image href="${cfg.img}" x="0" y="0" width="100" height="100"
               preserveAspectRatio="xMidYMid slice" clip-path="url(#ap)"/>
        <circle cx="50" cy="50" r="49" fill="none" stroke="#000" stroke-width="1" opacity="0.08"/>
      </svg>`;
    }

    const bg   = BG[cfg.bg]     || BG.milho;
    const skin = SKIN[cfg.skin] || SKIN.clara;
    const hair = HAIR[cfg.hair] || HAIR.castanho;

    return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="avatar-svg">
      <defs><clipPath id="ac"><circle cx="50" cy="50" r="50"/></clipPath></defs>
      <g clip-path="url(#ac)">
        <circle cx="50" cy="50" r="50" fill="${bg}"/>
        <circle cx="50" cy="50" r="50" fill="#000" opacity="0.04"/>
        <!-- ombros / roupa -->
        <ellipse cx="50" cy="98" rx="30" ry="20" fill="#FFF6E6"/>
        <ellipse cx="50" cy="98" rx="30" ry="20" fill="#000" opacity="0.05"/>
        <!-- pescoço -->
        <rect x="44" y="62" width="12" height="14" rx="5" fill="${skin}"/>
        <rect x="44" y="62" width="12" height="14" rx="5" fill="#000" opacity="0.06"/>
        <!-- orelhas -->
        <circle cx="28" cy="49" r="5" fill="${skin}"/>
        <circle cx="72" cy="49" r="5" fill="${skin}"/>
        <!-- cabeça -->
        <ellipse cx="50" cy="47" rx="23" ry="24" fill="${skin}"/>
        ${cabelo(cfg.hairStyle || 'curto', hair)}
        ${expressao(cfg.face)}
        ${acessorio(cfg.acc)}
        ${chapeu(cfg.hat)}
      </g>
      <circle cx="50" cy="50" r="49" fill="none" stroke="#000" stroke-width="1" opacity="0.08"/>
    </svg>`;
  }

  // ── Opções (para UI) e aleatório ───────────────────────────────
  const PARTS = {
    bg:        Object.keys(BG),
    skin:      Object.keys(SKIN),
    hair:      Object.keys(HAIR),
    hairStyle: ['curto', 'longo', 'coque', 'careca'],
    hat:       ['palha', 'cangaceiro', 'lenco', 'flor', 'fita', 'none'],
    acc:       ['none', 'sardas', 'bigode', 'oculos', 'pintinha'],
    face:      ['sorriso', 'risada', 'serelepe'],
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function random() {
    return {
      bg:        pick(PARTS.bg),
      skin:      pick(PARTS.skin),
      hair:      pick(PARTS.hair),
      hairStyle: pick(PARTS.hairStyle),
      hat:       pick(PARTS.hat),
      acc:       pick(PARTS.acc),
      face:      pick(PARTS.face),
    };
  }

  global.AVATAR = { render, random, PARTS, BG, SKIN, HAIR };
})(window);

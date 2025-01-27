import { Coordinate } from "./types";

export const clickEffectScript =  (coordinate: Coordinate) => `
  if (!document.getElementById('click-effect-style')) {
    const style = document.createElement('style');
    style.id = 'click-effect-style';
    style.textContent = \`
      .click-effect {
        position: fixed;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255, 0, 0, 0.5);
        pointer-events: none;
        transform: translate(-50%, -50%);
        animation: click-animation 0.5s ease-out forwards;
      }
      @keyframes click-animation {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
      }
    \`;
    document.head.appendChild(style);
  }
  
  const effect = document.createElement('div');
  effect.className = 'click-effect';
  effect.style.left = '${coordinate.x}px';
  effect.style.top = '${coordinate.y}px';
  document.body.appendChild(effect);
  setTimeout(() => effect.remove(), 500);
`;
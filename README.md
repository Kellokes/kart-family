# Kart Family

Jogo de kart 3D para o navegador (WebGL com three.js), com os personagens da família modelados no Meshy AI.

## Como jogar

- **Fácil:** o kart acelera sozinho; vire inclinando o celular deitado, como um volante.
- **Difícil:** joystick à esquerda para virar, botões ACELERAR e FREIO à direita (segure o freio para dar ré).
- **Computador:** setas ou WASD; espaço freia.
- Faixas amarelas na pista dão turbo; fora do asfalto o kart fica lento.
- Se a inclinação estiver ao contrário no seu celular, pause e toque em "Inverter inclinação".

## Rodar localmente

```bash
npm install
npm run dev      # abre em http://localhost:5173 (use o IP da rede para testar no celular)
npm run build    # gera dist/
```

## Estrutura

- `src/track.js` pista, cenário e utilidades de posição na pista
- `src/kart.js` modelo do kart, física arcade e colisões
- `src/bot.js` pilotos controlados pelo computador
- `src/input.js` teclado, inclinação (devicemotion), joystick e pedais
- `src/main.js` telas, corrida, voltas, HUD e câmera
- `public/models/` personagens otimizados (meshopt + texturas webp, ~14k triângulos)
- `scripts/opt.mjs` script que otimiza os GLB originais do Meshy:
  `node scripts/opt.mjs original.glb public/models/<id>.glb`

## Próximos passos

- Multiplayer com amigos (salas por código)
- Itens e mais pistas

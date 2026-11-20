// Página do modelo do cabeçalho: tamanho, regras e o botão de baixar.
export async function mostrar(raiz) {
  const arq = new URL('../modelos/modelo-cabecalho-2160x800.png', import.meta.url).href;
  raiz.innerHTML = `
    <h2>Modelo do cabeçalho</h2>
    <p class="sub">Baixe, cole como uma camada por cima da sua arte no Photoshop, monte o cabeçalho e esconda a camada antes de salvar.</p>
    <div class="caixa modelo">
      <img src="${arq}" alt="Modelo do cabeçalho">
      <ul>
        <li><b>Tamanho:</b> 2160 × 800 px (a largura toda do encarte). Salve em JPG ou PNG.</li>
        <li><b>Quadrado azul:</b> não escreva nada ali. As logos cadastradas no app ficam por cima, lado a lado ou uma em cima da outra.</li>
        <li><b>Linha vermelha:</b> nome da campanha e coisas importantes ficam do lado de dentro.</li>
        <li>Os produtos o app encaixa sozinho embaixo do cabeçalho.</li>
      </ul>
      <a class="btn esc" href="${arq}" download="modelo-cabecalho-2160x800.png">Baixar modelo</a>
    </div>`;
}

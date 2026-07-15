# Import review: nomes e ícones

## Objetivo

Impedir que nomes extensos criem rolagem horizontal na revisão de importação e
tornar a escolha de ícone previsível, visual e acessível.

## Layout

- O painel do modal deve ocultar qualquer excesso horizontal.
- A grade usa colunas que podem encolher (`minmax(0, ...)`); cada painel e a
  lista têm `min-width: 0`.
- Nomes na lista ficam em uma linha com reticências e expõem o nome completo no
  `title` do botão. O campo de nome no painel de edição permanece editável.

## Ícone

- O emoji sugerido na importação continua sendo o valor inicial.
- A prévia usa `ClipIcon`, o mesmo renderizador dos pads. URLs de imagem são
  imagens; qualquer outro valor é exibido como emoji, nunca como `src` de uma
  imagem.
- A pessoa escolhe um emoji em um popover pesquisável, navegável por teclado e
  compatível com o tema do Buddio.
- Um campo separado e opcional, “Imagem personalizada (URL)”, permite substituir
  o emoji. Ao limpar a URL, o emoji selecionado volta a ser a prévia.

## Dados e erros

- O valor persistido continua sendo a mesma propriedade `emoji`: um emoji ou
  uma URL HTTPS/data-image válida. Não há migração de banco.
- O conjunto de emojis usado pelo seletor é entregue com o app, sem depender de
  uma consulta de rede durante a importação.
- Se uma imagem de URL falhar, a prévia mostra o emoji selecionado e informa que
  a imagem não pôde ser carregada, sem quebrar o modal.

## Verificação

- Testes de componente cobrem seleção de emoji, troca para URL e fallback de
  imagem com falha.
- Teste visual/manual verifica nome muito longo sem rolagem horizontal e com
  reticências.

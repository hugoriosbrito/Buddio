# Buddio — Design System, Motion e Experiência do Usuário

> Documento de referência visual e funcional para o aplicativo desktop Buddio.  
> Versão: 1.0  
> Plataforma principal: Windows, com suporte planejado para macOS e Linux  
> Stack prevista: Tauri 2, Rust, React, TypeScript e Zustand

---

## 1. Visão do produto

O **Buddio** é um soundboard desktop **offline-first**, rápido e extensível. O aplicativo permite importar, organizar, editar e disparar áudios por atalhos globais em jogos, chamadas, transmissões, gravações e outros aplicativos.

A experiência deve transmitir quatro atributos centrais:

1. **Imediatismo** — o usuário encontra e toca um som em poucos segundos.
2. **Confiabilidade** — o áudio precisa sair pelo dispositivo correto, sem ambiguidade.
3. **Simplicidade** — a interface mostra apenas o que é necessário para a tarefa atual.
4. **Qualidade premium** — acabamento visual cuidadoso, movimentos sutis e feedback consistente.

O Buddio possui duas experiências complementares:

- **Aplicativo completo:** organização, edição, perfis, roteamento, diagnóstico e configurações.
- **Buddio Mini:** painel compacto aberto pelo tray do Windows para tocar sons rapidamente.

---



## 2. Princípios de design



### 2.1 Direto ao ponto

A ação principal de cada tela deve ser evidente. No soundboard, o foco é tocar sons. Na biblioteca, importar e organizar. No editor, ajustar e salvar. No roteamento, verificar para onde o áudio está indo.

Evitar:

- painéis informativos sem ação;
- cards promocionais;
- elementos decorativos que não ajudam na operação;
- excesso de ícones;
- múltiplos CTAs com o mesmo peso visual.



### 2.2 Offline-first visível

O Buddio funciona localmente, sem depender de conta ou internet. O status **Offline-first** deve aparecer de forma discreta na barra inferior e no Buddio Mini.

A ausência de internet não é tratada como erro.

### 2.3 Feedback imediato

Toda ação deve produzir uma resposta perceptível:

- pad pressionado;
- waveform ativada;
- hotkey reconhecida;
- áudio reproduzindo;
- rota funcionando;
- importação concluída;
- erro localizado e explicado.



### 2.4 Progressividade

A interface deve começar simples e revelar complexidade conforme necessário.

Exemplo:

- o card do som mostra nome, duração, atalho, waveform e play;
- propriedades avançadas aparecem no inspetor;
- edição detalhada ocorre apenas no editor de áudio;
- diagnóstico técnico fica em uma tela própria.



### 2.5 Aparência premium sem exagero

O acabamento premium é obtido por:

- espaçamento consistente;
- tipografia clara;
- superfícies bem separadas;
- bordas suaves;
- inner shadows discretos;
- animações curtas;
- estados de interação completos.

Não usar glassmorphism pesado, degradês excessivos, brilhos intensos ou sombras flutuantes em todos os elementos.

---



## 3. Arquitetura de informação



### 3.1 Navegação principal

O aplicativo completo possui cinco áreas:

1. **Soundboard**
2. **Biblioteca**
3. **Perfis**
4. **Roteamento**
5. **Configurações**

A sidebar permanece curta e estável. Coleções aparecem abaixo da navegação principal.

### 3.2 Estrutura da janela completa

A janela é dividida em:

- **Titlebar**
- **Sidebar**
- **Área principal**
- **Inspetor contextual**, quando aplicável
- **Barra de status inferior**

A barra de status mantém informações operacionais sempre visíveis:

- perfil ativo;
- saída virtual;
- monitor;
- mic mix;
- estado offline-first.



### 3.3 Estrutura do Buddio Mini

O Buddio Mini não possui sidebar. Ele inclui:

- marca e perfil ativo;
- busca rápida;
- sons fixados;
- botão Parar tudo;
- status de atalhos;
- saída atual;
- estado offline;
- botão Abrir Buddio.

Há também uma versão **Ultra Compact**, com quatro sons favoritos, status e botão de parada.

---



## 4. Design tokens



## 4.1 Cores da marca


| Token           | Valor     | Uso                               |
| --------------- | --------- | --------------------------------- |
| `brand.primary` | `#5B4DFF` | CTA, estado ativo, waveform ativa |
| `brand.deep`    | `#4438D8` | texto de destaque, borda ativa    |
| `brand.soft`    | `#ECE8FF` | fundo selecionado, hotkeys        |
| `brand.border`  | `#D7D0FF` | borda de elementos ativos         |
| `success`       | `#35A55A` | rota ativa, offline, sucesso      |
| `warning`       | `#E1A63A` | atenção, configuração incompleta  |
| `danger`        | `#FF5C62` | falha de saída, arquivo inválido  |




## 4.2 Tema claro


| Token               | Valor     |
| ------------------- | --------- |
| `canvas`            | `#E7E4DE` |
| `window`            | `#F7F6F2` |
| `sidebar`           | `#EEECE7` |
| `surface.primary`   | `#FFFFFF` |
| `surface.secondary` | `#F1EFEA` |
| `surface.selected`  | `#F5F2FF` |
| `border.default`    | `#DDD9D1` |
| `border.subtle`     | `#E8E5DE` |
| `text.primary`      | `#191820` |
| `text.secondary`    | `#7B776F` |
| `text.muted`        | `#A19C93` |




## 4.3 Tema escuro


| Token               | Valor     |
| ------------------- | --------- |
| `canvas`            | `#090A0D` |
| `window`            | `#121319` |
| `sidebar`           | `#0E0F14` |
| `surface.primary`   | `#1D1E24` |
| `surface.secondary` | `#25262E` |
| `surface.selected`  | `#2F2955` |
| `border.default`    | `#343641` |
| `border.subtle`     | `#292B34` |
| `text.primary`      | `#F5F3EE` |
| `text.secondary`    | `#A7A8B0` |
| `text.muted`        | `#777983` |


O modo escuro não deve ser uma inversão automática. As superfícies são separadas por luminância e borda, evitando preto absoluto dentro dos painéis.

---



## 5. Tipografia



### 5.1 Famílias

- **Inter** — interface, controles, títulos e informações.
- **Nunito ExtraBold** — wordmark “Buddio”, quando o texto da marca for utilizado.



### 5.2 Escala sugerida


| Estilo      | Tamanho | Peso    | Uso                        |
| ----------- | ------- | ------- | -------------------------- |
| Display     | 28 px   | 700     | título principal da tela   |
| Heading 1   | 22 px   | 700     | títulos de modal ou editor |
| Heading 2   | 17 px   | 700     | seções e cards importantes |
| Body Strong | 14 px   | 600     | nomes e botões             |
| Body        | 13 px   | 400–500 | conteúdo comum             |
| Caption     | 11 px   | 400–600 | duração, formato, status   |
| Micro       | 10 px   | 600     | labels e categorias        |




### 5.3 Regras

- Não usar mais de três pesos em uma tela.
- Evitar texto em caixa alta, exceto labels de seção curtos.
- Limitar linhas de descrição a 60–75 caracteres.
- Duração, taxa de amostragem e formato usam `Caption`.

---



## 6. Espaçamento, raios e grid



### 6.1 Escala de espaçamento

Base de 4 px:

`4, 8, 12, 16, 20, 24, 28, 32, 40, 48`

Regras principais:

- 8 px entre ícone e texto;
- 12 px entre controles relacionados;
- 16 px de padding interno em cards compactos;
- 20–24 px de padding em painéis;
- 28–32 px entre seções principais.



### 6.2 Raios


| Elemento         | Raio     |
| ---------------- | -------- |
| Janela externa   | 24–28 px |
| Painel principal | 20 px    |
| Card de áudio    | 18 px    |
| Campo e botão    | 12–14 px |
| Hotkey           | 7 px     |
| Pill             | 999 px   |




### 6.3 Densidade

O aplicativo completo prioriza respiro. O Buddio Mini usa densidade maior, mantendo áreas clicáveis mínimas de 36–40 px.

---



## 7. Sombras e profundidade



### 7.1 Outer shadow

Aplicada apenas em:

- janela principal;
- Buddio Mini;
- modal;
- card selecionado;
- menu flutuante.

Evitar sombras individuais em todos os cards.

### 7.2 Inner shadow premium

Os botões principais usam duas sombras internas:

**Highlight superior**

```text
X: 0
Y: -1
Blur: 3
Cor: #FFFFFF
Opacidade: 22–30%
Blend: Screen ou Normal
```

**Profundidade inferior**

```text
X: 0
Y: 2
Blur: 6
Cor: #2E2385
Opacidade: 18–28%
Blend: Multiply ou Normal
```

No modo escuro, o highlight pode subir para 28–34%, e a sombra inferior deve manter contraste sem parecer um bevel.

### 7.3 Estado pressionado

Ao pressionar:

- inner shadow inferior fica mais intensa;
- outer shadow diminui;
- elemento reduz para `scale(0.98)`;
- deslocamento visual máximo de 1 px.

---



## 8. Iconografia



### 8.1 Estilo

- ícones lineares;
- espessura entre 1.5 e 1.75 px;
- 16–18 px em controles;
- 20–24 px em ações principais;
- pontas e junções arredondadas.



### 8.2 Regra principal

Ícones ficam **diretamente na composição**, sem quadrado ou círculo decorativo atrás.

Fundos são permitidos apenas quando representam estado:

- seleção;
- erro;
- gravação;
- reprodução;
- drop target;
- hotkey.



### 8.3 Emojis

Emojis podem ser usados como identificação rápida dos sons. Eles não devem ficar presos dentro de tiles coloridos por padrão.

O usuário poderá futuramente substituir o emoji por:

- ícone;
- cor;
- imagem;
- letra;
- ausência de identificador.

---



## 9. Componentes



## 9.1 Botão primário

Uso:

- Importar áudio;
- Salvar alterações;
- Reparar rota;
- Concluir importação;
- Continuar onboarding.

Características:

- fundo roxo;
- texto branco;
- inner shadow;
- altura de 40–44 px;
- raio de 12 px;
- ícone opcional sem container.

Estados:

- default;
- hover;
- pressed;
- loading;
- disabled;
- success.



## 9.2 Botão secundário

- superfície branca ou `surface.secondary`;
- borda;
- inner shadow muito discreto;
- sem brilho;
- texto em `text.primary`.



## 9.3 Sound card

Conteúdo mínimo:

- identificador;
- nome;
- duração;
- hotkey;
- waveform;
- play/pause.

Estados obrigatórios:

1. padrão;
2. hover;
3. pressionado;
4. reproduzindo;
5. loop;
6. fila;
7. erro;
8. indisponível;
9. selecionado;
10. desabilitado.



## 9.4 Hotkey chip

- fundo roxo suave;
- borda roxa;
- fonte monoespaçada opcional;
- altura 24 px;
- feedback de captura;
- estado de conflito em vermelho.



## 9.5 Search

- busca por nome, tag, coleção e atalho;
- shortcut `Ctrl/Cmd + K`;
- resultados atualizados instantaneamente;
- sem botão “Buscar”.



## 9.6 Toggle

- largura aproximada de 34 px;
- feedback animado;
- estado ativo roxo;
- estado inativo neutro;
- label sempre visível.



## 9.7 Slider

- track neutro;
- progresso roxo;
- thumb branco com borda roxa;
- valor numérico visível;
- suporte a teclado e mouse wheel.



## 9.8 Inspector

Painel contextual para propriedades do som:

- nome e metadados;
- hotkey;
- volume;
- loop;
- reprodução exclusiva;
- saída;
- monitor;
- edição avançada.

O inspetor nunca substitui o editor completo.

## 9.9 Toast

Tipos:

- sucesso;
- informação;
- aviso;
- erro.

Regras:

- máximo de três simultâneos;
- duração padrão de 3 s;
- erros críticos permanecem;
- não cobrir controles principais;
- ação opcional como “Desfazer”.



## 9.10 Modal

- largura entre 420 e 640 px;
- fundo da página com overlay de 24–40%;
- entrada com fade + scale;
- foco preso dentro do modal;
- fechamento por `Esc`, quando seguro.

---



## 10. Motion system

A animação no Buddio deve reforçar causalidade e desempenho. Nenhuma transição deve atrasar a reprodução de áudio.

## 10.1 Durações


| Categoria            | Duração    |
| -------------------- | ---------- |
| Feedback instantâneo | 70–100 ms  |
| Hover e toggle       | 120–160 ms |
| Transição padrão     | 180–220 ms |
| Modal e painel       | 220–280 ms |
| Mudança de tela      | 240–320 ms |
| Erro e diagnóstico   | 180–360 ms |




## 10.2 Curvas

**Entrada padrão**

```css
cubic-bezier(0.22, 1, 0.36, 1)
```

**Saída**

```css
cubic-bezier(0.4, 0, 1, 1)
```

**Movimento físico curto**

```css
cubic-bezier(0.34, 1.56, 0.64, 1)
```

Usar a curva física apenas em elementos pequenos, como hotkey reconhecida ou confirmação de drop.

## 10.3 Pad pressionado

```text
Duração: 80 ms
Escala: 1 → 0.98
Inner shadow: +20%
Outer shadow: -50%
```

A execução do áudio começa imediatamente, sem esperar a animação.

## 10.4 Reprodução iniciada

```text
Duração inicial: 220 ms
Waveform: neutra → roxa
Play: vira pause
Card: pulso de borda único
```

Não animar continuamente o card inteiro. Apenas a waveform ou um indicador curto deve permanecer ativo.

## 10.5 Reprodução finalizada

```text
Fade visual: 120 ms
Waveform retorna ao neutro
Card retorna ao estado padrão
```



## 10.6 Loop

- pequeno ícone de loop gira 180° ao ativar;
- duração de 180 ms;
- não manter rotação contínua;
- borda ativa permanece visível.



## 10.7 Fila

O contador entra com:

```text
Scale: 0.8 → 1
Opacity: 0 → 1
Duração: 140 ms
```



## 10.8 Erro

```text
Shake: ±2 px
Ciclos: 2
Duração: 180 ms
Mensagem: permanece 3 s
```

Erros de saída também alteram a borda para vermelho e mostram ação “Corrigir rota”.

## 10.9 Modal

Entrada:

```text
Opacity: 0 → 1
Scale: 0.97 → 1
Y: 6 px → 0
Duração: 220 ms
```

Saída:

```text
Opacity: 1 → 0
Scale: 1 → 0.985
Duração: 140 ms
```



## 10.10 Toast

- entra por baixo com 8 px;
- fade de 160 ms;
- barra de duração opcional;
- remoção com 120 ms.



## 10.11 Drag and drop

Ao arrastar arquivos:

- drop zone aumenta 1%;
- borda tracejada muda para roxo;
- ícone sobe 2 px;
- fundo recebe `brand.soft`;
- duração de 140 ms.



## 10.12 Reduce motion

Quando o sistema operacional solicitar redução de movimento:

- remover escalas;
- remover shake;
- usar apenas opacity;
- manter duração máxima de 120 ms;
- não animar waveform decorativamente.

---



## 11. UX dos fluxos principais



## 11.1 Primeiro uso

Objetivo: chegar ao primeiro som funcional sem configuração técnica excessiva.

Fluxo:

1. Boas-vindas.
2. Detectar microfone, monitor e dispositivo virtual.
3. Explicar em uma frase o que será configurado.
4. Testar monitor.
5. Testar microfone virtual.
6. Importar primeiro som.
7. Definir hotkey.
8. Executar teste.
9. Abrir Soundboard.

O onboarding deve permitir pular etapas, mas mostrar claramente o que ficará indisponível.

## 11.2 Importação de arquivos

O usuário pode:

- arrastar arquivos;
- escolher arquivos;
- importar uma pasta;
- monitorar uma pasta.

Antes de importar, pode definir:

- coleção;
- copiar para a biblioteca;
- normalizar volume;
- gerar waveform;
- sugerir atalhos livres.

Durante a importação:

- progresso por arquivo;
- status legível;
- possibilidade de cancelar;
- app permanece utilizável.



## 11.3 Revisão da importação

Categorias:

- pronto;
- duplicado;
- incompatível;
- precisa de atenção;
- concluído.

Duplicados oferecem:

- ignorar;
- substituir;
- manter ambos;
- aplicar a todos.



## 11.4 Disparo do áudio

O som pode ser executado por:

- clique no card;
- botão play;
- hotkey global;
- command palette;
- Buddio Mini;
- integração externa.

O feedback visual deve ser idêntico independentemente da origem da execução.

## 11.5 Edição de áudio

O editor é não destrutivo.

Ferramentas:

- trim;
- fade-in;
- fade-out;
- normalização;
- remover silêncio;
- velocidade;
- volume;
- loop;
- reprodução exclusiva;
- duplicar trecho;
- reverter.

O arquivo original não deve ser alterado sem consentimento explícito.

## 11.6 Captura de hotkey

Fluxo:

1. Clicar no campo.
2. Interface entra em modo de captura.
3. Pressionar combinação.
4. Validar.
5. Mostrar conflito, caso exista.
6. Escolher substituir, cancelar ou usar outra combinação.
7. Confirmar sucesso.

Durante a captura, atalhos do Buddio ficam temporariamente suspensos para evitar disparos acidentais.

## 11.7 Roteamento

O roteamento deve ser explicado visualmente:

```text
Microfone → Mixer Buddio → Microfone virtual → Aplicativo/Monitor
```

A tela mostra:

- dispositivo;
- status;
- nível;
- sample rate;
- latência aproximada;
- ação de teste;
- diagnóstico;
- reparo.

Termos técnicos devem possuir explicação curta.

## 11.8 Perfis

Perfis guardam:

- coleção visível;
- hotkeys;
- saída;
- monitor;
- volume;
- mic mix;
- ducking;
- comportamento dos pads.

Exemplos:

- Streaming;
- Discord;
- Jogos;
- Trabalho;
- Podcast.

A troca de perfil deve ser instantânea e confirmada por um toast curto.

## 11.9 Buddio Mini

O Buddio Mini é aberto pelo tray.

Prioridades:

1. tocar um som;
2. parar tudo;
3. confirmar rota;
4. abrir o app completo.

Não incluir editor, biblioteca completa ou configurações avançadas.

Sons fixados são organizados em grade de duas colunas. A versão Ultra Compact oferece quatro pads.

## 11.10 Diagnóstico

O diagnóstico deve responder:

- por que não há som;
- onde a rota falhou;
- como corrigir;
- se a correção foi aplicada.

Nunca exibir apenas códigos de erro.

Exemplo:

> “O Buddio Virtual Mic não está disponível. Ele pode ter sido desativado pelo Windows.”

Ações:

- Tentar novamente;
- Reparar rota;
- Abrir configurações de áudio;
- Copiar diagnóstico.

---



## 12. Estados vazios e erros



## 12.1 Biblioteca vazia

Mensagem:

> “Sua biblioteca ainda está vazia.”

Ações:

- Importar arquivos;
- Importar pasta;
- Abrir exemplos locais, se disponíveis.



## 12.2 Nenhum resultado

> “Nenhum som encontrado para ‘explosão’.”

Sugestões:

- limpar filtros;
- buscar por atalho;
- importar novo som.



## 12.3 Sem saída

O card continua visível, mas o play indica falha. Exibir:

- “Saída indisponível”;
- ação “Corrigir rota”;
- tooltip com o dispositivo esperado.



## 12.4 Arquivo movido

Oferecer:

- localizar arquivo;
- remover da biblioteca;
- procurar automaticamente na pasta original.

---



## 13. Acessibilidade

Requisitos mínimos:

- contraste WCAG AA;
- foco visível;
- navegação completa por teclado;
- labels para leitores de tela;
- não depender apenas de cor;
- hit area mínima de 36 × 36 px;
- suporte a reduce motion;
- escala de interface;
- tooltips para ícones sem texto.

Atalhos importantes:


| Ação                  | Atalho         |
| --------------------- | -------------- |
| Busca/Command palette | `Ctrl/Cmd + K` |
| Importar áudio        | `Ctrl/Cmd + I` |
| Parar tudo            | configurável   |
| Fechar modal          | `Esc`          |
| Salvar                | `Ctrl/Cmd + S` |
| Abrir Buddio Mini     | configurável   |


---



## 14. Conteúdo e tom de voz

O Buddio deve falar de forma:

- simples;
- objetiva;
- amigável;
- não técnica por padrão;
- técnica quando o usuário abrir detalhes.

Preferir:

> “A saída não está disponível.”

Evitar:

> “CPAL DeviceNotAvailable on WASAPI host.”

Preferir verbos claros:

- Importar
- Tocar
- Parar
- Testar
- Corrigir
- Salvar
- Abrir
- Substituir

---



## 15. Regras para modo claro e escuro

- Componentes possuem o mesmo layout nos dois temas.
- O roxo mantém identidade, mas pode ter luminância ajustada.
- Borders são mais importantes no modo escuro.
- Outer shadows são mais discretas no escuro.
- Inner shadows dos CTAs permanecem visíveis.
- Waveforms inativas não devem desaparecer.
- O tema pode seguir o sistema, ser claro ou escuro.
- Mudança de tema usa fade de 160 ms, sem transição de todas as propriedades por longos períodos.

---



## 16. Tamanhos de janela



### Aplicativo completo

- referência: 1440 × 960;
- mínimo recomendado: 1100 × 720;
- sidebar fixa;
- inspector pode recolher em janelas menores.



### Buddio Mini

- referência: 520 × 740;
- comportamento de popover;
- deve fechar ao perder foco, salvo quando fixado;
- lembrar posição;
- abrir próximo ao tray.



### Ultra Compact

- referência: 520 × 260;
- quatro sons favoritos;
- botão de parada;
- status;
- acesso ao aplicativo.

---



## 17. Considerações técnicas de UX



### 17.1 Latência

A animação nunca deve bloquear:

- hotkey;
- reprodução;
- stop;
- mute;
- troca de rota.

O áudio é prioridade de tempo real.

### 17.2 Persistência

Salvar automaticamente:

- posição da janela;
- tamanho;
- tema;
- coleção aberta;
- sons fixados no Mini;
- perfil ativo;
- última saída válida.



### 17.3 Recuperação

Se um dispositivo desaparecer:

1. manter a seleção anterior;
2. tentar reconectar;
3. usar fallback apenas se configurado;
4. avisar o usuário;
5. permitir correção rápida no Mini.



### 17.4 Background

Quando minimizado:

- hotkeys continuam ativas;
- tray mostra estado;
- notificações são discretas;
- app não deve abrir janela principal a cada execução.

---



## 18. Inventário de telas



### Aplicativo principal

- Soundboard — claro e escuro
- Biblioteca — claro e escuro
- Perfis — claro e escuro
- Roteamento — claro e escuro
- Configurações — claro e escuro



### Fluxos premium

- Importar arquivos — claro e escuro
- Revisar importação — claro e escuro
- Editor de áudio — claro e escuro
- Captura de hotkey — claro e escuro
- Estados do soundboard — claro e escuro
- Command palette — claro e escuro
- Onboarding de áudio — claro e escuro
- Diagnóstico — claro e escuro
- Motion system — claro e escuro



### Buddio Mini

- Padrão — claro e escuro
- Busca — claro e escuro
- Reproduzindo — claro e escuro
- Aviso de rota — claro e escuro
- Ultra Compact — claro e escuro

---



## 19. Links do Figma

- Arquivo principal:  
[https://www.figma.com/design/G3u0RrAfEbVonNGrktrqNw](https://www.figma.com/design/G3u0RrAfEbVonNGrktrqNw)
- Interfaces principais:  
[https://www.figma.com/design/G3u0RrAfEbVonNGrktrqNw?node-id=19-2](https://www.figma.com/design/G3u0RrAfEbVonNGrktrqNw?node-id=19-2)
- Fluxos premium:  
[https://www.figma.com/design/G3u0RrAfEbVonNGrktrqNw?node-id=25-2](https://www.figma.com/design/G3u0RrAfEbVonNGrktrqNw?node-id=25-2)
- Buddio Mini / Tray:  
[https://www.figma.com/design/G3u0RrAfEbVonNGrktrqNw?node-id=27-2](https://www.figma.com/design/G3u0RrAfEbVonNGrktrqNw?node-id=27-2)
- Onboarding:
- [https://www.figma.com/design/G3u0RrAfEbVonNGrktrqNw/Buddio-%E2%80%94-Logo---Brand-Marks?node-id=31-2](https://www.figma.com/design/G3u0RrAfEbVonNGrktrqNw/Buddio-%E2%80%94-Logo---Brand-Marks?node-id=31-2)

---



## 20. Checklist de qualidade

Antes de considerar uma tela pronta, verificar:

- [ ] A ação principal está evidente.
- [ ] Existe estado de loading, erro e vazio.
- [ ] Todos os controles possuem hover, focus e pressed.
- [ ] A navegação por teclado funciona.
- [ ] O tema escuro possui contraste próprio.
- [ ] Ícones não possuem fundos decorativos desnecessários.
- [ ] Botões principais usam inner shadow.
- [ ] A interface informa a rota de áudio atual.
- [ ] Nenhuma animação bloqueia o áudio.
- [ ] A mesma ação tem feedback consistente em todos os pontos de entrada.
- [ ] Erros explicam a causa e oferecem solução.
- [ ] O uso offline permanece funcional.
- [ ] O Buddio Mini permite tocar um som em até dois cliques.

---



## 21. Resumo da experiência

O Buddio deve parecer uma ferramenta profissional que desaparece quando não é necessária e responde imediatamente quando é acionada.

O aplicativo completo oferece controle e organização. O Buddio Mini oferece velocidade. O design visual combina superfícies calmas, hierarquia simples, roxo como cor funcional e movimentos curtos.

A experiência ideal é:

> abrir, encontrar, tocar e continuar o que o usuário já estava fazendo.


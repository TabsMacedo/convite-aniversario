# Tábata's party

Convite leve e mobile first para **30 de janeiro de 2027, às 12h**, na Chácara Recanto Feliz, em Araras - SP. O planejamento foi atualizado antes da implementação no arquivo `../Planejamento-site-aniversario.docx`.

## Abrir no computador

É necessário **Node.js 22.12 ou mais recente**. No terminal, entre nesta pasta e execute:

```powershell
cd C:\Users\tabat\Downloads\convite-aniversario\site-aniversario
npm start
```

Não é necessário executar `npm install`: o projeto usa os recursos do próprio Node.js.

- Convite: **http://127.0.0.1:3000**
- Área da Tábata: **http://127.0.0.1:3000/admin**

Na primeira execução, o terminal mostra uma **senha aleatória** para a área da Tábata. Guarde essa senha: ela não aparece nas execuções seguintes. Para parar o servidor, use `Ctrl+C`.

O servidor precisa estar ligado para abrir o site e salvar respostas. Abrir `index.html` diretamente não substitui o servidor.

## Escolher ou trocar a senha

Com o servidor parado, copie `.env.example` para `.env` e acrescente:

```dotenv
ADMIN_PASSWORD="escolha-aqui-uma-senha-com-pelo-menos-12-caracteres"
```

Substitua o exemplo por sua senha e execute `npm start`. Isso também permite recuperar o acesso se você perder a senha inicial. Uma mudança de senha encerra as sessões anteriores no próximo início do servidor. A senha do exemplo não é usada pelo projeto.

## O que os convidados preenchem

- Nome.
- Uma das opções: **Vou**, **Talvez**, **Não vou**.
- Observação opcional, com até 1.000 caracteres.

Não há cadastro nem pedido de telefone. O convite inclui a família: cônjuge e filhos são bem-vindos. O campo de observação sugere informar quem acompanhará o convidado e quantas pessoas irão com ele. O look pode fazer referência a roupas ou filmes dos anos 2000. O texto informa que cada pessoa leva carne e, se quiser, bebida alcoólica ou outro item; Tábata oferece acompanhamentos e refrigerante.

Ao voltar pelo mesmo navegador, a pessoa pode atualizar a resposta. A identificação fica em um cookie protegido. Se limpar os cookies ou mudar de aparelho, uma nova resposta será criada; nomes iguais não são unidos automaticamente. O painel permite conferir esses casos pelos nomes e recados.

## Consultar e baixar as respostas

Entre em `/admin` com sua senha. **Os totais contam pessoas**, incluindo presenças registradas pela organizadora e acompanhantes identificados nas observações. O servidor relê os recados ao consultar ou exportar a lista, tanto para respostas antigas quanto para novas. Por exemplo, “Bruno vai comigo” acrescenta Bruno e “vai eu, meu esposo, a Laís e mais dois enteados” representa cinco pessoas. Acompanhantes identificados aparecem individualmente, com referência ao convidado principal, e seguem a resposta dele: Vou, Talvez ou Não vou.

A leitura usa regras locais e não envia os recados a serviços de inteligência artificial. Textos vagos (“minha família”), condicionais, nomes repetidos e possíveis duplicações ficam sinalizados no filtro **Observações para conferir**. A contagem dessas famílias pode estar incompleta enquanto houver pendências; não há como determinar uma quantidade exata a partir de um texto que não a informa. Parentes já cadastrados e referências explícitas a uma confirmação existente são considerados para evitar duplicações.

Use **Conferir acompanhantes** no registro principal para corrigir a lista, com um nome por linha. Não repita os acompanhantes já cadastrados mostrados no formulário. Pessoas sem nome podem ser registradas como “Enteado 1” e “Enteado 2”. As conferências ficam no SQLite e sobrevivem a reinícios; se o convidado mudar o recado, o painel solicita nova conferência. **Usar leitura automática** remove a conferência manual daquele registro. Os recados originais não são alterados por essa leitura. Os acompanhantes automáticos são calculados a partir dos recados persistidos, sem acumular registros no banco a cada acesso.

As presenças de **Tábata, Gabriel, Marcelo, Patrícia, Carlos de Macedo (pai), Kalel, Elza e Neném** são incluídas como **Vou** no início do servidor e também entram na exportação DOCX. Cada uma tem uma observação indicando a confirmação pela Tábata. Carlos de Macedo (pai) está identificado como o avô que acompanha Maria, e Kalel como o namorado que acompanha Ariane; os registros já existentes de Maria e Ariane permanecem intactos. Elza e Neném estão identificados como tia e tio da Tábata. Essas inclusões usam identificadores fixos no SQLite para não se repetirem ao reiniciar ou publicar novamente. A lista fica em `lib/confirmed-guests.mjs`, que não é servido publicamente. No Render, as presenças serão incluídas no banco persistente quando esta versão for publicada e iniciada; editar o código local não altera o banco hospedado.

Quando houver um único registro com o nome **Elvis Silva** (aceitando diferenças de maiúsculas e espaços), o servidor inclui como **Vou** seus três acompanhantes: **Joyce**, **Pietra** e **Namorado da Pietra**, cujo nome ainda não foi informado. As observações dos acompanhantes fazem referência a Elvis Silva. A observação original dele é preservada e recebe um complemento com os nomes, o total de quatro pessoas e o aviso de que os acompanhantes já entram nos totais. Essa atualização é aplicada uma única vez, na mesma transação das inclusões, e não sobrescreve futuras edições do recado. Se Elvis ainda não tiver um registro, a atualização fica pendente para o próximo início; se houver homônimos, nenhum deles é alterado automaticamente.

O botão **Baixar lista em DOCX** gera um documento Word com resumo e tabela de todas as respostas. O arquivo inclui as observações completas e a data de atualização. Busca e filtro na tela não limitam a exportação. Nenhum dado é enviado ao Word ou a outro serviço para gerar o arquivo.

## Dados e autenticação

O servidor JavaScript grava em `data/responses.sqlite`, usando SQLite, com consultas parametrizadas. A pasta `data/` é criada no primeiro início. Em `data/config.json`, ficam o hash da senha e o segredo aleatório que assina os tokens; essa pasta não é servida pela aplicação.

O acesso administrativo usa JWT HS256 com assinatura, emissor, destinatário e expiração de oito horas validados no servidor. A sessão usa cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção. Sair revoga a sessão no banco. O navegador não armazena o JWT em `localStorage`. O servidor verifica a origem dos envios, restringe tentativas de login e limita o tamanho dos campos e do corpo das requisições.

Para consultas assistidas autorizadas neste computador Windows, `scripts/remote-admin.ps1` acessa o mesmo painel por HTTPS e encerra a sessão depois de cada operação. Na configuração (`-Configure`), a senha fica protegida pelo DPAPI do usuário Windows em `.qa/render-admin.credential.xml`, fora do Git. Não copie esse arquivo para o servidor ou para outra conta. Se a senha do Render mudar, configure novamente. A ação padrão `Read` consulta as respostas; `SetCompanions` e `ResetCompanions` permitem salvar uma conferência autorizada por identificador. Nenhuma senha, JWT ou cookie é impresso. O acesso não roda em segundo plano: o script é usado durante as solicitações da organizadora.

Faça cópias periódicas da pasta `data/` **com o servidor parado**. Guarde essa pasta e o arquivo `.env` em local privado. Apagar a pasta remove respostas e configurações. Não coloque essa pasta em diretório público.

## Publicar para os convidados

A entrega está preparada para execução local; ainda não há URL pública. Para disponibilizar o site, a hospedagem precisa executar Node.js e oferecer **disco persistente** para SQLite. Uma hospedagem apenas de HTML não executa o servidor. Use uma instância do aplicativo e mantenha os dados no mesmo disco; múltiplas instâncias independentes não compartilham esse banco.

Na hospedagem, configure:

```dotenv
NODE_ENV=production
PUBLIC_ORIGIN=https://seu-dominio.com.br
HOST=0.0.0.0
PORT=3000
DATA_DIR=/caminho/do/disco-persistente/tabata
ADMIN_PASSWORD="sua-senha-privada-com-pelo-menos-12-caracteres"
```

`PUBLIC_ORIGIN` deve corresponder à URL final, sem barra no final. O servidor deve ficar atrás do HTTPS da hospedagem. Use o comando de início de `npm start`; não há etapa de build. A aplicação gera seu segredo JWT no disco persistente, ou aceita `JWT_SECRET` com pelo menos 32 caracteres. Não publique o `.env`, a pasta de dados ou o convite original fora das rotas previstas.

Para testar no celular da mesma rede Wi-Fi antes da publicação, configure `HOST=0.0.0.0` no `.env`, reinicie e abra `http://IP-DO-COMPUTADOR:3000` no celular. O computador pode solicitar liberação dessa porta no firewall. Esse endereço de rede local funciona apenas naquela rede.

## Organização do código

```text
public/
  index.html                 Convite e formulário
  admin.html                 Entrada e painel da organizadora
  css/variables.css          Cores, fontes e medidas reutilizadas
  css/base.css               Estilos básicos e acessibilidade
  css/layout.css             Estrutura e pontos de adaptação de tela
  css/components.css         Botões, recortes, cartões e formulário
  css/decorations.css        Estrelas cromadas, óculos com strass e globo espelhado
  css/theme-y2k.css          Tema escuro, jeans fotográfico e camadas de colagem
  css/theme-toggle.css       Botão de sol/lua e cores do tema claro
  css/admin.css              Estilos específicos da área administrativa
  images/                    Referências originais e cópias leves usadas no site
  js/rsvp.js                 Envio e atualização da confirmação
  js/theme.js                Escolha e restauração do tema no navegador
  js/admin.js                Autenticação, consulta, busca e download
lib/docx.mjs                 Geração do documento Word no servidor
server.mjs                   Servidor HTTP, SQLite, JWT e rotas
test/app.test.mjs            Testes integrados com banco e servidor reais
```

O visual recria as cores e as colagens do convite com CSS e pequenos vetores. Os adesivos de estrelas cromadas e pink, óculos com strass, globo espelhado e brilhos são símbolos SVG reutilizados no próprio `index.html`, com cores centralizadas em `variables.css` e estilos em `decorations.css`. São decorativos, não interceptam toques e não são anunciados pelos leitores de tela. A página não baixa a imagem grande do convite, fontes externas ou bibliotecas de interface. O servidor comprime HTML, CSS e JavaScript. Mensagens de sucesso só aparecem depois da gravação.

A paleta revisada usa **pink neon `#FF008C`** e **amarelo fluorescente `#F5FF00`**, com azul jeans e **fundo noturno `#080D17`**. Cartões e botões neon usam texto escuro. As áreas de leitura e preenchimento usam superfícies azul escuras e texto claro. O tema da página da festa fica em `theme-y2k.css`; as cores continuam centralizadas em `variables.css`.

O botão de sol/lua no cabeçalho alterna entre claro e escuro. **O padrão é escuro**, independentemente da configuração do aparelho. A escolha fica salva apenas neste navegador e é restaurada antes de exibir a página. No tema claro, as informações e o formulário têm fundos claros; o jeans, as colagens e os destaques neon são preservados. Se o navegador bloquear o armazenamento, ainda é possível alternar os temas durante a visita.

As imagens adicionadas por Tábata orientaram o patchwork de jeans, o jornal rasgado, a flor de cristal, o globo e o recorte de boca. O site usa cópias com nomes estáveis em `public/images/`: `jeans-colagem.jpg`, `jornal-recorte.jpg`, `flor-cristal.png`, `globo-festa.png` e `beijo-pink-sem-fundo.png`. Os PNGs de referência permanecem intactos. A textura de jeans foi recodificada de aproximadamente 1,48 MB para 152 KB; o navegador reutiliza o mesmo arquivo no fundo e nas seções. O recorte de boca no rodapé tem fundo transparente e carregamento adiado. A imagem foi editada com a ferramenta integrada imagegen; a instrução e os detalhes estão em `docs/edicao-boca.md`. O servidor só disponibiliza as imagens explicitamente listadas nas rotas públicas.

Depois de alterar HTML, CSS ou JavaScript, reinicie o servidor com `Ctrl+C` e `npm start`: os arquivos públicos são carregados na memória no início. As prévias em `preview/` mostram a versão atual em celular e computador, com arquivos separados para os temas escuro e claro.

## Verificar

```powershell
npm test
```

Os testes cobrem validação dos dados, alteração de uma resposta, nomes iguais de pessoas diferentes, acesso privado, JWT inválido e expirado, revogação ao sair, persistência após reinício e exportação DOCX com caracteres especiais.

Referências técnicas: [SQLite no Node.js 22.12](https://nodejs.org/download/release/v22.12.0/docs/api/sqlite.html) e [especificação JWT](https://www.rfc-editor.org/rfc/rfc7519.html).

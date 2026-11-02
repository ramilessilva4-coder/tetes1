# RAMILES INTELLIGENCE

Estúdio web para criar apresentações geopolíticas cinematográficas com mapa interativo, editor de cenas e modo de gravação.

## Deploy na Vercel

1. Envie **o conteúdo desta pasta** para a raiz do repositório GitHub (não coloque os arquivos dentro de uma segunda pasta).
2. Na Vercel, importe o repositório. Framework Preset: **Other**. Build Command: `npm run build`. Output Directory: `.`.
3. Faça o deploy. O núcleo do editor e do mapa não exige chave de API.
4. Para ativar **Criar cenas com IA**, adicione `OPENAI_API_KEY` em Project → Settings → Environment Variables. Opcionalmente, defina `OPENAI_MODEL` (padrão: `gpt-4.1-mini`) e faça um novo deploy.

## O que está incluído

- Mapa MapLibre com estilo escuro CARTO, navegação, seleção e destaque de países (Natural Earth).
- Cenas com câmera, zoom, transições, títulos e notas privadas do apresentador.
- Criação, duplicação, exclusão, reordenação e seleção de cenas.
- Painéis de texto, notícia, imagem e indicador; fontes, datas, links, créditos e upload local de imagem.
- Marcadores, rotas ilustrativas com setas e áreas/polígonos.
- Autosave em IndexedDB, lista de projetos locais e importação/exportação JSON.
- Modo apresentação limpo, atalhos ←/→ e ESC, adequado para captura em 16:9/1080p.
- Endpoint serverless para geração de rascunhos com IA; a chave fica apenas no servidor.

## Observações

- O mapa base, a camada de países e as fontes tipográficas são carregados de serviços externos; é necessária conexão com a internet.
- Projetos ficam no navegador e não sincronizam entre dispositivos. Exporte backups JSON regularmente.
- Uploads de imagem são incorporados ao projeto local; arquivos de até 8 MB por imagem.
- A geração por IA é opcional e requer uma chave de API paga do provedor. A saída é sempre rascunho e exige revisão humana.
- Rotas, marcadores e áreas são elementos editoriais ilustrativos, não dados de rastreamento em tempo real.

## Desenvolvimento local

Requer Node.js 20 ou superior. Execute `npm run build` para verificar sintaxe e estrutura. Como o app é estático, pode ser servido por qualquer servidor HTTP local; para testar a função de IA, use a Vercel CLI e configure `OPENAI_API_KEY`.

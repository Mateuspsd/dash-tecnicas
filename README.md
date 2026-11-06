# Painel de desempenho — Técnicas para Concursos

Painel de Meta Ads com visão geral, funil, público, conjuntos, criativos, ritmo do orçamento
e uma aba de recomendações com ganho estimado. Os dados vêm direto da API de Marketing da Meta,
e o acesso é protegido por senha.

## Como funciona

- `index.html` + `runtime.js`: a página (visual, gráficos, cálculos e recomendações).
- `api/meta.js`: função do Vercel que consulta a Meta com o token guardado no servidor.
  O navegador só escolhe a fonte, a conta e o período; o token nunca vai para a página.
- `api/login.js`: senha de acesso (cookie válido por 30 dias).

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Nome | Obrigatória | O que é |
|---|---|---|
| `META_TOKEN` | sim | Token de acesso da Meta com permissão `ads_read` (veja abaixo) |
| `DASH_PASSWORD` | sim | Senha para abrir o painel |
| `META_ACCOUNTS` | não | IDs das contas permitidas, separados por vírgula (sem `act_`). Padrão: as 4 contas da BM 01 |
| `META_API_VERSION` | não | Versão da API (padrão `v21.0`) |

## Gerar o token da Meta (uma vez)

1. Em developers.facebook.com, crie um app do tipo **Empresa** e vincule ao portfólio *BM 01 - Técnicas para Concursos*.
2. No Gerenciador de Negócios → **Configurações do negócio → Usuários → Usuários do sistema**, crie um usuário do sistema (função Funcionário).
3. Em **Atribuir ativos**, dê a ele acesso às contas de anúncios (permissão de ver desempenho).
4. Clique em **Gerar novo token**, escolha o app, marque `ads_read` (e `read_insights`) e defina **sem expiração**.
5. Copie o token e cole em `META_TOKEN` no Vercel. Não coloque o token no código nem envie por mensagem.

## Publicar no Vercel

1. vercel.com → **Add New → Project** → importe `Mateuspsd/dash-tecnicas`.
2. Framework Preset: **Other**. Não precisa de comando de build.
3. Adicione `META_TOKEN` e `DASH_PASSWORD` em Environment Variables e clique em **Deploy**.
4. Se quiser um domínio próprio (ex.: `painel.seudominio.com.br`), adicione em Settings → Domains.

## Manutenção

- Para adicionar uma conta: inclua o ID em `META_ACCOUNTS` e uma `<option>` no seletor de conta em `index.html`.
- Erros da Meta (token expirado, sem permissão) aparecem como “Falha ao carregar”; o motivo fica no console do navegador e nos logs do Vercel.

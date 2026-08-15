# Auditoria — Excel do Dia x Painel Sell Out

Objetivo: nenhuma informação necessária ao arquivo oficial pode existir apenas dentro do gerador de Excel. O painel é a fonte de verdade e o Excel apenas materializa o mesmo estado.

## Regra de arquitetura

- `src/panelMetrics.ts` é o motor único dos indicadores que alimentam o Excel do Dia.
- `src/ExcelSourceOfTruthOverlay.tsx` exibe esses mesmos indicadores nas telas do painel.
- Os escritores `excelSheet*.ts` apenas materializam `panelMetrics` no modelo `.xlsx`.
- Dado sem fonte carregada deve aparecer como pendência no painel e não deve reaproveitar valor antigo escondido no modelo.

## SELL OUT - Milenio 2026

| Bloco do modelo | Dados | Onde aparece no painel | Fonte |
|---|---|---|---|
| Calendário | Competência, dias úteis, dias trabalhados, data de atualização | Resumo + Configurações > Metas | competência do 8022 + dias úteis configurados |
| Movimento diário | Dia, Sell Out, Faturado, Positivação | Resumo > Movimento Diário | 8022 |
| Conferência diária | soma diária x consolidado e diferenças | Configurações > Conferência | 8022 |
| Ritmo | Meta venda média diária, média diária atual, média necessária | Resumo > Base oficial do Excel | Meta Sell Out + dias úteis + 8022 |
| Resumo | Meta, Faturado, Tendência Faturado, Sell Out, Tendência Sell Out | Resumo | 8022 + Meta Sell Out |
| Histórico | mesmo mês do ano anterior, média últimos 3 meses e variações | Resumo | Histórico 379 |
| Estoque PV | posição a preço de venda, cobertura, carteira convertida, total, cobertura total | Estoque > Cobertura do Excel | 105 + Carteira + histórico |
| Estoque custo | posição a custo, cobertura, carteira, total, cobertura total | Estoque > Cobertura do Excel | 105 + Carteira + histórico |
| Markup | relação posição venda / posição custo | Estoque > Cobertura do Excel | 105; não é mais lido de célula escondida do modelo |
| Referência de cobertura | dias-alvo do estoque | Configurações > Metas | parâmetro do painel; padrão inicial 60 |
| Positivação | meta, atual, tendência, média 3 meses, percentuais | Resumo > Positivação | Bússola + 8022 + Histórico |
| Top 5 Redes | meta, ano anterior, faturado, tendência, Sell Out, tendência, percentuais | Redes > Base do Excel | Premissas + 8022 + Histórico + metas de rede |
| Linhas | participação da meta, meta, faturado, cobertura, tendência | Resumo > Linhas de Produto | 8022 + parâmetros de linha |
| Verba por linha | verba utilizada e % sobre faturado | Resumo + Configurações > Metas | manual provisório até existir fonte automática equivalente ao antigo 12.303 |

## EQUIPES

Todos os campos do modelo são exibidos em **Gerencial > Apuração completa por RCA**:

- Coordenação e nome do coordenador;
- código e nome do RCA;
- Meta;
- Faturado e %;
- A Faturar;
- Realizado + A Faturar e %;
- Ideal para hoje e diferença para o ideal;
- Falta para a meta total;
- Meta de positivação;
- Positivação faturada e %;
- Positivação a faturar;
- Positivados + A Faturar e %;
- Ideal de positivações e diferença;
- Falta de positivação;
- Target diário de positivação.

A aba EQUIPES do Excel cresce automaticamente quando a quantidade de RCAs excede as linhas originais do modelo.

## Conferência antes da exportação

**Configurações > Conferência** apresenta o status de cada bloco e as bases que o alimentam. O botão **EXCEL DO DIA** também informa a quantidade de pendências.

Pendências não bloqueantes podem gerar células em branco; valores não devem ser inventados. Pendências estruturais que tornariam o cálculo incorreto (ex.: participação das linhas diferente de 100% ou 8022 antigo sem separação de faturado por linha) bloqueiam a geração com mensagem explícita.

# Painel Sell Out • Milênio

Reconstrução versionada do painel criado originalmente no ChatGPT Work.

## Estado desta versão

Esta primeira baseline prioriza a estrutura visual e os comportamentos já definidos no projeto:

- Resumo, Gerencial, Equipe, Estoque, Conferência e Upload de dados.
- Upload mantido como última página da navegação.
- Gráfico diário exibindo todos os dias do mês, inclusive os futuros sem dados.
- Formatação pt-BR para moedas, percentuais e inteiros.
- Meta Sell Out T&C manual e separada das metas dos vendedores.
- Metas de redes editáveis com redistribuição proporcional das demais redes.
- Metas consolidadas da equipe apresentadas no fim da página.
- Persistência do estado no navegador via `localStorage`, mantendo a última base/configuração após F5.
- Classificação financeira por linha de estoque marcada explicitamente como pendente de validação até que o campo oficial do cadastro 286 seja definido.

## Importante

Os números atuais são uma base demonstrativa usada apenas para reconstruir e comparar a interface. Os parsers dos relatórios 8022, 8013, Bússola, cadastro 286, trânsito e histórico ainda serão conectados na próxima etapa.

## Executar localmente

```bash
npm install
npm run dev
```

## Validar build

```bash
npm run build
```

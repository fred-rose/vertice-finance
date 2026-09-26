export function RecoveryGuidance() {
  return (
    <details>
      <summary>Como recuperar preservando os dados atuais</summary>
      <p>
        Mantenha este perfil e os dados deste navegador intactos. Guarde uma
        cópia do backup JSON v2 válido que já possuir.
      </p>
      <p>
        Para recuperar esse arquivo, abra o Vértice em outro perfil de navegador
        limpo ou em outro dispositivo, conclua a inicialização normal e restaure
        o backup nas Configurações. Isso não mescla dados nem recupera
        alterações posteriores ao backup; a origem atual continua preservada.
      </p>
      <p>
        Sem um backup válido, será necessária análise e extração técnica,
        preservando a base atual. Não é possível reconstruir saldos ou
        configurações perdidos a partir dos lançamentos restantes.
      </p>
    </details>
  );
}

export function LocalDataRecovery({
  error,
  onRetry,
  onRestore,
}: {
  error: Error;
  onRetry: () => void;
  onRestore: () => void;
}) {
  return (
    <section
      className="panel empty-state"
      aria-label="Recuperação de dados locais"
    >
      <p role="alert">{error.message}</p>
      <div className="row-actions">
        <button className="secondary-button" onClick={onRetry}>
          Tentar novamente
        </button>
        <button className="secondary-button" onClick={onRestore}>
          Restaurar backup JSON
        </button>
      </div>
      <RecoveryGuidance />
    </section>
  );
}

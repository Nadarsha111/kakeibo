import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useCallback,
} from "react";
import { Account, Transaction } from "../types";
import AddTransactionModal from "../components/modals/AddTransactionModal";

interface ModalProps {
  transactionToEdit?: Transaction | null;
  loanForRepayment?: Account | null;
  initialType?: "income" | "expense" | "transfer";
  initialFromAccount?: Account | null;
  prefill?: {
    amount?: number;
    description?: string;
    date?: string;
    type?: "income" | "expense";
    accountId?: number;
  } | null;
}

interface TransactionModalContextType {
  openModal: (props?: ModalProps) => void;
  closeModal: () => void;
}

const TransactionModalContext = createContext<
  TransactionModalContextType | undefined
>(undefined);

export const TransactionModalProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [modalProps, setModalProps] = useState<ModalProps>({});

  const openModal = useCallback((props: ModalProps = {}) => {
    setModalProps(props);
    setIsVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsVisible(false);
    setModalProps({}); // Reset props on close
  }, []);

  return (
    <TransactionModalContext.Provider value={{ openModal, closeModal }}>
      {children}
      <AddTransactionModal
        visible={isVisible}
        onClose={closeModal}
        onTransactionAdded={closeModal} // Closes modal on success
        transactionToEdit={modalProps.transactionToEdit}
        loanForRepayment={modalProps.loanForRepayment}
        initialType={modalProps.initialType}
        initialFromAccount={modalProps.initialFromAccount}
        prefill={modalProps.prefill}
      />
    </TransactionModalContext.Provider>
  );
};

export const useTransactionModal = () => {
  const context = useContext(TransactionModalContext);
  if (!context) {
    throw new Error(
      "useTransactionModal must be used within a TransactionModalProvider",
    );
  }
  return context;
};

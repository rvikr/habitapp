import { createContext, useContext, useState, useRef, type ReactNode } from "react";
import { View, Text, Modal, StyleSheet } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { success } from "@/lib/haptics";

const MESSAGES = [
  "Great job! 🎉",
  "Streak strengthened! 🔥",
  "Keep it up! ✨",
  "You're on fire! 🌟",
  "Habit logged! 💪",
  "Crushing it! 🏆",
];

type Ctx = { celebrate: (message?: string) => void };
const CelebrationContext = createContext<Ctx>({ celebrate: () => {} });

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function celebrate(msg?: string) {
    setMessage(msg ?? MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
    setVisible(true);
    success();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 1800);
  }

  return (
    <CelebrationContext.Provider value={{ celebrate }}>
      {children}
      <Modal transparent visible={visible} animationType="fade">
        <View style={StyleSheet.absoluteFill} className="items-center justify-center pointer-events-none">
          <View className="bg-surface-lowest dark:bg-d-surface-lowest rounded-3xl px-xl py-lg items-center" style={{ shadowColor: "#F26B1F", shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 }}>
            <Text className="text-headline-md text-on-surface dark:text-d-on-surface font-bold text-center">{message}</Text>
          </View>
          {visible && (
            <ConfettiCannon
              count={80}
              origin={{ x: -10, y: 0 }}
              autoStart
              fadeOut
              explosionSpeed={350}
              fallSpeed={3000}
              colors={["#F26B1F", "#FFC56B", "#3EBB7F", "#C24E0D", "#E4A23A", "#FFE6CF"]}
            />
          )}
        </View>
      </Modal>
    </CelebrationContext.Provider>
  );
}

export function useCelebrate() {
  return useContext(CelebrationContext).celebrate;
}

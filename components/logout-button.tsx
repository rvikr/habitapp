import { TouchableOpacity, Text } from "react-native";
import { useRouter } from "expo-router";
import { signOut } from "@/lib/data/actions";
import { useLanguage } from "@/components/language-provider";

type Props = { className?: string };

export default function LogoutButton({ className }: Props) {
  const router = useRouter();
  const { t } = useLanguage();

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <TouchableOpacity onPress={handleSignOut} className={className}>
      <Text className="text-error text-body-md font-semibold">{t("Sign out")}</Text>
    </TouchableOpacity>
  );
}

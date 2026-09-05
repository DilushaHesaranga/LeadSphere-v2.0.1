import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { ComponentProps } from "react";

import { useAuth } from "@/auth/AuthContext";
import { StateView } from "@/components/StateView";
import { mobileNavigationItems } from "./navigationModel";
import { ForgotPasswordScreen } from "@/screens/ForgotPasswordScreen";
import { FollowUpsScreen } from "@/screens/FollowUpsScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { LoginScreen } from "@/screens/LoginScreen";
import { PipelineScreen } from "@/screens/PipelineScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { ResetPasswordScreen } from "@/screens/ResetPasswordScreen";
import { TicketDetailScreen } from "@/screens/TicketDetailScreen";
import { WorkListScreen } from "@/screens/WorkListScreen";
import { colors } from "@/theme/tokens";
import type {
  AuthStackParamList,
  MainTabParamList,
  WorkStackParamList,
} from "@/types/navigation";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();
const WorkStack = createNativeStackNavigator<WorkStackParamList>();

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const TAB_ICONS: Record<
  keyof MainTabParamList,
  { active: IoniconName; inactive: IoniconName }
> = {
  Home: { active: "home", inactive: "home-outline" },
  Work: { active: "briefcase", inactive: "briefcase-outline" },
  FollowUps: { active: "calendar", inactive: "calendar-outline" },
  Pipeline: { active: "analytics", inactive: "analytics-outline" },
  Profile: { active: "person", inactive: "person-outline" },
};

function AuthNavigator({ recovery = false }: { recovery?: boolean }) {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      {recovery ? (
        <AuthStack.Screen
          name="ResetPassword"
          component={ResetPasswordScreen}
        />
      ) : (
        <>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
          />
        </>
      )}
    </AuthStack.Navigator>
  );
}

function WorkNavigator() {
  return (
    <WorkStack.Navigator
      screenOptions={{
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
      }}
    >
      <WorkStack.Screen
        name="WorkList"
        component={WorkListScreen}
        options={{ headerShown: false }}
      />
      <WorkStack.Screen
        name="TicketDetail"
        component={TicketDetailScreen}
        options={({ route }) => ({
          title: route.params.companyName || "Ticket details",
        })}
      />
    </WorkStack.Navigator>
  );
}

function MainNavigator() {
  const { authorization } = useAuth();
  const items = mobileNavigationItems(authorization.permissions);
  return (
    <MainTabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: "700" },
        tabBarIcon: ({ color, focused, size }) => {
          const icons = TAB_ICONS[route.name];
          return (
            <Ionicons
              name={focused ? icons.active : icons.inactive}
              color={color}
              size={size}
            />
          );
        },
      })}
    >
      {items.some((item) => item.key === "Home") ? (
        <MainTabs.Screen name="Home" component={HomeScreen} />
      ) : null}
      {items.some((item) => item.key === "Work") ? (
        <MainTabs.Screen name="Work" component={WorkNavigator} />
      ) : null}
      {items.some((item) => item.key === "FollowUps") ? (
        <MainTabs.Screen
          name="FollowUps"
          component={FollowUpsScreen}
          options={{ title: "Follow Ups" }}
        />
      ) : null}
      {items.some((item) => item.key === "Pipeline") ? (
        <MainTabs.Screen name="Pipeline" component={PipelineScreen} />
      ) : null}
      {items.some((item) => item.key === "Profile") ? (
        <MainTabs.Screen name="Profile" component={ProfileScreen} />
      ) : null}
    </MainTabs.Navigator>
  );
}

export function RootNavigator() {
  const { status, authorization, message, refreshAccess, signOut } = useAuth();

  if (status === "restoring" || status === "loadingAccess") {
    return (
      <StateView
        title="Loading your workspace"
        description="Restoring your secure LeadSphere session and permissions."
        loading
      />
    );
  }
  if (status === "signedOut") return <AuthNavigator />;
  if (status === "passwordRecovery") return <AuthNavigator recovery />;
  if (status === "ready") return <MainNavigator />;
  if (status === "unsupportedRole") {
    const roleNames = authorization.roles.map((role) => role.name).join(", ");
    return (
      <StateView
        title="Role not supported yet"
        description={`LeadSphere Mobile currently supports Sales Executives only. Your active role${roleNames ? ` is ${roleNames}` : " is not supported"}.`}
        actionLabel="Sign out"
        onAction={() => void signOut()}
      />
    );
  }
  if (status === "disabled") {
    return (
      <StateView
        title="Account access is disabled"
        description="Contact your LeadSphere System Administrator to restore access."
        actionLabel="Sign out"
        onAction={() => void signOut()}
      />
    );
  }
  return (
    <StateView
      title="Access could not be loaded"
      description={message || "Check your connection and try again."}
      actionLabel="Retry"
      onAction={() => void refreshAccess()}
      secondaryLabel="Sign out"
      onSecondary={() => void signOut()}
    />
  );
}

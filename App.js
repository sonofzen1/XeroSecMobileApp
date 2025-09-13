import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Dimensions, ScrollView, Platform } from "react-native";
import {
  Provider as PaperProvider,
  Appbar,
  IconButton,
  Modal,
  Portal,
  Card,
  Text,
  List,
  Button,
  Chip,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { LineChart, BarChart } from "react-native-chart-kit";
import * as Notifications from "expo-notifications";
import axios from "axios";

// Show alerts for local notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function App() {
  // ----- State for real data -----
  const [cpuHistory, setCpuHistory] = useState(() => Array(20).fill(0)); // CPU history
  const [ramHistory, setRamHistory] = useState(() => Array(20).fill(0)); // RAM history
  const [disks, setDisks] = useState([]);
  const [net, setNet] = useState({
    ip: "unknown",
    mask: "/unknown",
    gateway: "unknown",
    dns: [],
  });
  const [error, setError] = useState(null);

  // UI state
  const [threshold, setThreshold] = useState(75); // slider value
  const [limit, setLimit] = useState(null); // committed limit after Submit
  const [modalVisible, setModalVisible] = useState(false);

  // Chart widths (to avoid bleed)
  const [cpuW, setCpuW] = useState(Dimensions.get("window").width - 32); // CPU chart width
  const [ramW, setRamW] = useState(Dimensions.get("window").width - 32); // RAM chart width
  const [diskW, setDiskW] = useState(Dimensions.get("window").width - 32);
  const CHART_H = 200;

  // Track if we are currently "over limit" to avoid spamming notifications
  const overRef = useRef(false);

  // Ask notif permissions & set Android channel
  useEffect(() => {
    (async () => {
      await Notifications.requestPermissionsAsync();
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
        });
      }
    })();
  }, []);

  // Fetch real data from backend every 2 seconds
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get("http://192.168.86.54:8000");
        const data = response.data;

        // Update CPU history
        setCpuHistory((prev) => [
          ...prev.slice(1),
          Math.round(data.cpu_usage_pct),
        ]);

        // Update RAM history
        setRamHistory((prev) => {
          const nextVal = Math.round(data.memory_usage_pct);
          const next = [...prev.slice(1), nextVal];

          // Notify if we cross from under -> over
          if (limit != null) {
            if (nextVal > limit && !overRef.current) {
              overRef.current = true;
              Notifications.scheduleNotificationAsync({
                content: {
                  title: "XeroSec Alert",
                  body: `RAM too high on computer 1: ${nextVal}% (limit ${limit}%)`,
                },
                trigger: null, // immediate
              });
            } else if (nextVal <= limit && overRef.current) {
              overRef.current = false;
            }
          }

          return next;
        });

        // Update disks
        setDisks(
          data.disks.map((d) => ({
            name: d.mount,
            total: d.total_gb,
            used: d.used_gb,
          }))
        );

        // Update network
        setNet({
          ip: data.network.ip,
          mask: data.network.subnet_mask,
          gateway: data.network.gateway,
          dns: data.network.dns_servers,
        });

        setError(null);
      } catch (err) {
        setError("Failed to fetch system info");
      }
    };

    fetchData(); // Initial fetch
    const id = setInterval(fetchData, 2000); // Every 2 seconds
    return () => clearInterval(id);
  }, [limit]);

  // Chart data
  const cpuChartData = useMemo(
    () => ({
      labels: Array.from({ length: cpuHistory.length }, () => ""),
      datasets: [{ data: cpuHistory.map((n) => Number(n)) }],
    }),
    [cpuHistory]
  );

  const ramChartData = useMemo(
    () => ({
      labels: Array.from({ length: ramHistory.length }, () => ""),
      datasets: [{ data: ramHistory.map((n) => Number(n)) }],
    }),
    [ramHistory]
  );

  const diskChartData = useMemo(
    () => ({
      labels: disks.map((d) => d.name),
      datasets: [{ data: disks.map((d) => d.used) }],
    }),
    [disks]
  );

  const chartConfig = {
    backgroundColor: "#fff",
    backgroundGradientFrom: "#fff",
    backgroundGradientTo: "#fff",
    decimalPlaces: 0,
    color: (o = 1) => `rgba(0,0,0,${o})`,
    labelColor: (o = 1) => `rgba(0,0,0,${o})`,
    propsForDots: { r: "2" },
  };

  return (
    <PaperProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        {/* Title */}
        <Appbar.Header
          mode="center-aligned"
          style={{ justifyContent: "flex-start" }}
        >
          <Appbar.Content title="XeroSec" titleStyle={{ fontWeight: "700" }} />
        </Appbar.Header>

        {/* Scrollable content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <IconButton
              icon="bell-outline"
              size={24}
              onPress={() => setModalVisible(true)}
              accessibilityLabel="Open threshold settings"
            />
            <View style={{ flex: 1 }}>
              <List.Accordion
                title="computer 1"
                left={(props) => <List.Icon {...props} icon="laptop" />}
                style={{ backgroundColor: "#f6f6f6", borderRadius: 12 }}
              >
                {/* CPU Line Chart */}
                <Card mode="elevated" style={{ margin: 8, borderRadius: 12 }}>
                  <Card.Title
                    title="CPU usage"
                    subtitle="Live"
                    left={(p) => <List.Icon {...p} icon="cpu-64-bit" />}
                  />
                  <Card.Content>
                    <View
                      onLayout={(e) => setCpuW(e.nativeEvent.layout.width)}
                      style={{ width: "100%" }}
                    >
                      <LineChart
                        data={cpuChartData}
                        width={Math.max(0, cpuW)}
                        height={CHART_H}
                        chartConfig={chartConfig}
                        bezier
                        style={{ borderRadius: 12 }}
                        withInnerLines
                        withOuterLines
                        withVerticalLabels={false}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginTop: 8,
                      }}
                    >
                      <Text variant="bodySmall">
                        Current: {cpuHistory[cpuHistory.length - 1]}%
                      </Text>
                    </View>
                  </Card.Content>
                </Card>

                {/* RAM Line Chart */}
                <Card mode="elevated" style={{ margin: 8, borderRadius: 12 }}>
                  <Card.Title
                    title="RAM usage"
                    subtitle={`Live • ${
                      limit != null ? `limit ${limit}%` : "no limit set"
                    }`}
                    left={(p) => <List.Icon {...p} icon="memory" />}
                  />
                  <Card.Content>
                    <View
                      onLayout={(e) => setRamW(e.nativeEvent.layout.width)}
                      style={{ width: "100%" }}
                    >
                      <LineChart
                        data={ramChartData}
                        width={Math.max(0, ramW)}
                        height={CHART_H}
                        chartConfig={chartConfig}
                        bezier
                        style={{ borderRadius: 12 }}
                        withInnerLines
                        withOuterLines
                        withVerticalLabels={false}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginTop: 8,
                      }}
                    >
                      <Text variant="bodySmall">
                        Current: {ramHistory[ramHistory.length - 1]}%
                      </Text>
                      <Text variant="bodySmall">
                        Threshold (slider): {threshold}%
                      </Text>
                    </View>
                  </Card.Content>
                </Card>

                {/* Disks Bar Chart */}
                <Card mode="elevated" style={{ margin: 8, borderRadius: 12 }}>
                  <Card.Title
                    title="Disks (used GB)"
                    left={(p) => <List.Icon {...p} icon="harddisk" />}
                  />
                  <Card.Content>
                    <View
                      onLayout={(e) => setDiskW(e.nativeEvent.layout.width)}
                      style={{ width: "100%" }}
                    >
                      <BarChart
                        data={diskChartData}
                        width={Math.max(0, diskW)}
                        height={CHART_H}
                        chartConfig={chartConfig}
                        style={{ borderRadius: 12 }}
                        fromZero
                        showValuesOnTopOfBars
                      />
                    </View>
                    <View style={{ marginTop: 8 }}>
                      {disks.map((d, i) => (
                        <Text key={i} variant="bodySmall">
                          {d.name} — {d.used}/{d.total} GB (
                          {Math.round((d.used / d.total) * 100)}%)
                        </Text>
                      ))}
                    </View>
                  </Card.Content>
                </Card>

                {/* Network Info */}
                <Card mode="elevated" style={{ margin: 8, borderRadius: 12 }}>
                  <Card.Title
                    title="Network"
                    left={(p) => (
                      <List.Icon {...p} icon="access-point-network" />
                    )}
                  />
                  <Card.Content>
                    <List.Item
                      title="IP"
                      description={net.ip}
                      left={(p) => <List.Icon {...p} icon="ip-network" />}
                    />
                    <List.Item
                      title="Subnet Mask"
                      description={net.mask}
                      left={(p) => <List.Icon {...p} icon="cog" />}
                    />
                    <List.Item
                      title="Gateway"
                      description={net.gateway}
                      left={(p) => <List.Icon {...p} icon="router" />}
                    />
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 6,
                        marginTop: 6,
                      }}
                    >
                      {net.dns.map((d, i) => (
                        <Chip key={i} icon="dns">
                          {d}
                        </Chip>
                      ))}
                    </View>
                  </Card.Content>
                </Card>
              </List.Accordion>
            </View>
          </View>
          {error && (
            <Text style={{ color: "red", marginTop: 10 }}>{error}</Text>
          )}
        </ScrollView>

        {/* Threshold Modal */}
        <Portal>
          <Modal
            visible={modalVisible}
            onDismiss={() => setModalVisible(false)}
            contentContainerStyle={{
              backgroundColor: "white",
              padding: 16,
              margin: 16,
              borderRadius: 16,
            }}
          >
            {/* X close (top-right) */}
            <IconButton
              icon="close"
              size={20}
              onPress={() => setModalVisible(false)}
              style={{ position: "absolute", right: 4, top: 4 }}
              accessibilityLabel="Close modal"
            />

            <Text
              variant="titleMedium"
              style={{ marginBottom: 12, paddingRight: 28 }}
            >
              RAM Alert Threshold
            </Text>
            <Slider
              minimumValue={0}
              maximumValue={100}
              step={1}
              value={threshold}
              onValueChange={setThreshold}
            />
            <Text style={{ textAlign: "center", marginTop: 8 }}>
              {threshold}%
            </Text>

            {/* Submit button: commit the limit and close */}
            <Button
              mode="contained"
              style={{ marginTop: 16 }}
              onPress={() => {
                setLimit(threshold);
                overRef.current = false; // reset crossing state
                setModalVisible(false);
              }}
            >
              Submit
            </Button>
          </Modal>
        </Portal>
      </SafeAreaView>
    </PaperProvider>
  );
}

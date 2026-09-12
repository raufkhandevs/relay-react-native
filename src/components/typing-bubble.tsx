import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

const DOT_COUNT = 3;
const STAGGER_MS = 150;
const LOOP_MS = 1200;
// Matches the web keyframes: opacity/lift peak at 30% of the cycle, then ease
// back over the remaining 70%.
const RISE_MS = LOOP_MS * 0.3;
const FALL_MS = LOOP_MS * 0.7;

/**
 * Mirrors `prefers-reduced-motion` on the web client. Read once on mount and
 * re-read on every change, since the user can toggle this in Settings while
 * the app is open.
 */
function useReduceMotion(): boolean {
    const [reduceMotion, setReduceMotion] = useState(false);

    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
            if (mounted) {
                setReduceMotion(enabled);
            }
        });
        const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
        return () => {
            mounted = false;
            subscription.remove();
        };
    }, []);

    return reduceMotion;
}

function Dot({ delay, reduceMotion, color }: { delay: number; reduceMotion: boolean; color: string }) {
    // useState, not useRef: the eslint react-hooks rules on this project treat
    // reading `.current` during render as a ref access, even for a stable
    // Animated.Value. The initializer form runs once, same as a ref would.
    const [progress] = useState(() => new Animated.Value(0));

    useEffect(() => {
        if (reduceMotion) {
            progress.setValue(0);
            return;
        }

        progress.setValue(0);
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(progress, { toValue: 1, duration: RISE_MS, useNativeDriver: true }),
                Animated.timing(progress, { toValue: 0, duration: FALL_MS, useNativeDriver: true }),
            ]),
        );
        // The stagger is a one-time offset to the loop's start, like CSS
        // `animation-delay`, not a per-iteration delay - that would keep
        // stretching each dot's period and drift them out of sync.
        const timer = setTimeout(() => loop.start(), delay);
        return () => {
            clearTimeout(timer);
            loop.stop();
        };
    }, [reduceMotion, delay, progress]);

    const opacity = reduceMotion ? 0.6 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
    const translateY = reduceMotion ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

    return (
        <Animated.View
            style={[styles.dot, { backgroundColor: color, opacity, transform: [{ translateY }] }]}
        />
    );
}

/**
 * Three dots in a bubble shaped like an incoming message (see
 * docs/decisions/0009-one-design-system-two-densities.md), rendered as the
 * FlatList footer's last item so the existing auto-scroll carries it into
 * view like any other message.
 *
 * The dots are decoration: the whole bubble is one `accessible` group so
 * VoiceOver skips the dots themselves, and `announceForAccessibility` fires
 * once on mount so the name is heard without anyone having to focus the
 * bubble - the iOS equivalent of the web client's `aria-live="polite"` span.
 * It announces once because, like the web client, this component unmounts
 * when typing stops rather than toggling a hidden state.
 */
export function TypingBubble({ name }: { name: string }) {
    const theme = useTheme();
    const reduceMotion = useReduceMotion();

    useEffect(() => {
        AccessibilityInfo.announceForAccessibility(`${name} is typing`);
    }, [name]);

    return (
        <View style={styles.row}>
            <View
                accessible
                accessibilityLabel={`${name} is typing`}
                style={[styles.bubble, { backgroundColor: theme.surface, borderColor: theme.rule }]}>
                {Array.from({ length: DOT_COUNT }, (_, index) => (
                    <Dot key={index} delay={index * STAGGER_MS} reduceMotion={reduceMotion} color={theme.textSecondary} />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        alignItems: 'flex-start',
        marginBottom: Spacing.four,
    },
    bubble: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        borderRadius: Spacing.two,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
});

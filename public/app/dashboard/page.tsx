import Dashboard from "../../components/Dashboard";

/**
 * No wrapper. Dashboard already owns a full-height page and paints its own
 * background.
 *
 * There used to be one here, and it did two things that only showed up on a
 * wide screen. It painted a slate-700 gradient -- far lighter than anything
 * else on the page -- and it centred the dashboard as a flex item, which makes
 * a block element shrink to its content instead of filling the width. So on a
 * big display the dashboard sat in the middle at its content width with the
 * lighter gradient showing down either side of it.
 */
export default function DashboardPage() {
    return <Dashboard />;
}
